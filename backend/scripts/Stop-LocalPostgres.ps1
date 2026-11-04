$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$projectRoot = Split-Path $backendRoot -Parent
& (Join-Path $projectRoot '.postgres-local/pgsql/bin/pg_ctl.exe') -D (Join-Path $backendRoot '.local/data') -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop PostgreSQL.' }

