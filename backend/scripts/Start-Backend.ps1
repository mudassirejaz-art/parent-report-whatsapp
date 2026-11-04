param([int]$Port = 8000)
$ErrorActionPreference='Stop'
$backendRoot=Split-Path $PSScriptRoot -Parent
$python=Join-Path $backendRoot '.venv/Scripts/python.exe'
if (-not (Test-Path $python)) { throw 'Create backend/.venv and install backend/requirements.txt first.' }
& $python -m uvicorn app.main:app --app-dir $backendRoot --host 127.0.0.1 --port $Port
if ($LASTEXITCODE -ne 0) { throw 'Backend exited with an error.' }
