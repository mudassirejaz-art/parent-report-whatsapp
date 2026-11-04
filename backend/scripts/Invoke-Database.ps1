param(
 [ValidateSet('migrate','test','status')][string]$Action = 'status',
 [string]$PsqlPath = '',
 [string]$DatabaseUrl = ''
)
$ErrorActionPreference='Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
if (-not $PsqlPath) { $PsqlPath = Join-Path (Split-Path $backendRoot -Parent) '.postgres-local/pgsql/bin/psql.exe' }
if (-not (Test-Path $PsqlPath)) { $PsqlPath = 'psql' }
if (-not $DatabaseUrl) {
 $DatabaseUrl = $env:MIGRATION_DATABASE_URL
 if (-not $DatabaseUrl) {
  $envFile = Join-Path $backendRoot '.env'
  if (Test-Path $envFile) {
   $line = Get-Content $envFile | Where-Object { $_ -match '^MIGRATION_DATABASE_URL=' } | Select-Object -First 1
   if ($line) { $DatabaseUrl = $line.Substring('MIGRATION_DATABASE_URL='.Length) }
  }
 }
}
if (-not $DatabaseUrl) { throw 'Set MIGRATION_DATABASE_URL or run Start-LocalPostgres.ps1.' }
# Parse the URL so secrets never appear in process arguments.
$uri = [Uri]$DatabaseUrl
$parts = $uri.UserInfo.Split(':',2)
$oldPassword=$env:PGPASSWORD
$oldSslMode=$env:PGSSLMODE
$oldClientEncoding=$env:PGCLIENTENCODING
$oldOutputEncoding=$OutputEncoding
try {
 $env:PGCLIENTENCODING='UTF8'
 $OutputEncoding=New-Object System.Text.UTF8Encoding
 $env:PGPASSWORD=[Uri]::UnescapeDataString($parts[1])
 $hostName=$uri.Host
 $portNumber=$uri.Port
 if ($portNumber -lt 0) { $portNumber=5432 }
 # Local cluster is loopback-only; remote use requires explicit TLS.
 $env:PGSSLMODE = if ($hostName -in @('localhost','127.0.0.1','::1')) { 'prefer' } else { 'verify-full' }
 $common=@('-X','-h',$hostName,'-p',"$portNumber",'-U',[Uri]::UnescapeDataString($parts[0]),'-d',$uri.AbsolutePath.TrimStart('/'),'-v','ON_ERROR_STOP=1')
 function Run-Sql([string]$Sql) {
  $result = $Sql | & $PsqlPath @common -tA
  if ($LASTEXITCODE -ne 0) { throw 'SQL command failed; no credentials were printed.' }
  return $result
 }
 if ($Action -eq 'migrate') {
  # Build one transaction so concurrent runners serialize and failures leave no partial migration.
  $statements = "begin; select pg_advisory_xact_lock(725109318); create table if not exists public.parentreport_migrations (version text primary key, sha256 text not null, applied_at timestamptz not null default now()); revoke all on public.parentreport_migrations from public;`n"
  foreach ($migration in (Get-ChildItem (Join-Path $backendRoot 'db/migrations') -Filter '*.sql' | Sort-Object Name)) {
   $version=$migration.Name
   $hash=(Get-FileHash $migration.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
   $body=[IO.File]::ReadAllText($migration.FullName)
   # psql conditionals are evaluated after obtaining the transaction lock.
   $statements += "select not exists(select 1 from public.parentreport_migrations where version='$version') as apply_migration \gset`n"
   $statements += "\if :apply_migration`n$body`ninsert into public.parentreport_migrations(version,sha256) values('$version','$hash');`n"
   $statements += "\else`nDO `$verify`$ begin if not exists(select 1 from public.parentreport_migrations where version='$version' and sha256='$hash') then raise exception 'Applied migration checksum mismatch: $version'; end if; end `$verify`$;`n\endif`n"
  }
  $statements += "commit;"
  $statements | & $PsqlPath @common
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed and was rolled back.' }
 } elseif ($Action -eq 'test') {
  & $PsqlPath @common -f (Join-Path $backendRoot 'db/tests/permissions.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Database tests failed.' }
 } else {
  Run-Sql "select current_database(),version(); select version,applied_at from public.parentreport_migrations order by version; select schemaname,count(*) from pg_tables where schemaname in ('app','app_private') group by schemaname;" | Write-Output
 }
} finally { $env:PGPASSWORD=$oldPassword; $env:PGSSLMODE=$oldSslMode; $env:PGCLIENTENCODING=$oldClientEncoding; $OutputEncoding=$oldOutputEncoding }

