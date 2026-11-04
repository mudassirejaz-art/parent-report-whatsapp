param([int]$Port = 55432)
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$projectRoot = Split-Path $backendRoot -Parent
$binaryRoot = Join-Path $projectRoot '.postgres-local/pgsql/bin'
$localRoot = Join-Path $backendRoot '.local'
$dataRoot = Join-Path $localRoot 'data'
$pgCtl = Join-Path $binaryRoot 'pg_ctl.exe'
if (-not (Test-Path $pgCtl)) { throw "Download official Windows PostgreSQL 17+ binaries and extract pgsql into $projectRoot/.postgres-local first. See backend/README.md." }
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
function New-LocalPassword {
 $bytes = New-Object byte[] 32
 $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
 try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
 return ([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
}
$ownerPasswordFile = Join-Path $localRoot 'owner.pass'
$apiPasswordFile = Join-Path $localRoot 'api.pass'
foreach ($file in @($ownerPasswordFile,$apiPasswordFile)) {
 if (-not (Test-Path $file)) { [IO.File]::WriteAllText($file,(New-LocalPassword)) }
}
# Restrict local credentials and cluster files to this Windows user.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $localRoot /inheritance:r /grant:r ("${identity}:(OI)(CI)F") /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect local database files.' }
if (-not (Test-Path (Join-Path $dataRoot 'PG_VERSION'))) {
 & (Join-Path $binaryRoot 'initdb.exe') -D $dataRoot -U parentreport_owner --pwfile=$ownerPasswordFile -A scram-sha-256 -E UTF8 --locale=C
 if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
}
& $pgCtl -D $dataRoot status *> $null
if ($LASTEXITCODE -ne 0) {
 $ctlArgs = @('-D',('"' + $dataRoot + '"'),'-l',('"' + (Join-Path $localRoot 'postgres.log') + '"'),'-o',('"-h 127.0.0.1 -p ' + $Port + '"'),'-w','start')
 $start = Start-Process -FilePath $pgCtl -ArgumentList $ctlArgs -WindowStyle Hidden -PassThru
 # Wait only for pg_ctl, not its long-lived postgres child process.
 $start.WaitForExit()
 if ($start.ExitCode -ne 0) { throw "PostgreSQL failed to start. Inspect backend/.local/postgres.log." }
}
$oldPassword = $env:PGPASSWORD
try {
 $env:PGPASSWORD = [IO.File]::ReadAllText($ownerPasswordFile).Trim()
 $psql = Join-Path $binaryRoot 'psql.exe'
 $common = @('-X','-h','127.0.0.1','-p',"$Port",'-U','parentreport_owner','-v','ON_ERROR_STOP=1')
 $databaseExists = & $psql @common -d postgres -tAc "select 1 from pg_database where datname='parentreport'"
 if ($LASTEXITCODE -ne 0) { throw 'Database connection failed.' }
 if ($databaseExists -ne '1') {
  & (Join-Path $binaryRoot 'createdb.exe') -h 127.0.0.1 -p $Port -U parentreport_owner parentreport
  if ($LASTEXITCODE -ne 0) { throw 'createdb failed.' }
 }
 $runtimeExists = & $psql @common -d parentreport -tAc "select 1 from pg_roles where rolname='parentreport_runtime'"
 if ($runtimeExists -ne '1') {
  & $psql @common -d parentreport -c 'create role parentreport_runtime nologin nosuperuser nocreatedb nocreaterole nobypassrls'
  if ($LASTEXITCODE -ne 0) { throw 'Creating runtime role failed.' }
 }
 $apiExists = & $psql @common -d parentreport -tAc "select 1 from pg_roles where rolname='parentreport_api'"
 $apiPassword = [IO.File]::ReadAllText($apiPasswordFile).Trim()
 if ($apiExists -ne '1') {
  # This SQL is generated solely from a random hexadecimal password, never user input.
  $roleSql = "create role parentreport_api login nosuperuser nocreatedb nocreaterole nobypassrls password '$apiPassword'; grant parentreport_runtime to parentreport_api;"
  $roleSql | & $psql @common -d parentreport -q
  if ($LASTEXITCODE -ne 0) { throw 'Creating API role failed.' }
 }
 $ownerPassword = $env:PGPASSWORD
 $envPath = Join-Path $backendRoot '.env'
 if (-not (Test-Path $envPath)) {
  $content = "DATABASE_URL=postgresql://parentreport_api:${apiPassword}@127.0.0.1:${Port}/parentreport`nMIGRATION_DATABASE_URL=postgresql://parentreport_owner:${ownerPassword}@127.0.0.1:${Port}/parentreport`n"
  [IO.File]::WriteAllText($envPath,$content)
  & icacls.exe $envPath /inheritance:r /grant:r ("${identity}:F") /Q | Out-Null
 }
 Write-Host "ParentReport PostgreSQL is running at 127.0.0.1:$Port. Database: parentreport."
 Write-Host 'Credentials are stored in ignored backend/.env and backend/.local; values are not printed.'
} finally { $env:PGPASSWORD = $oldPassword }

