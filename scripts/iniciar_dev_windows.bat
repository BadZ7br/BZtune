@echo off
setlocal
cd /d "%~dp0.."
if not exist "doomvault-api\.venv\Scripts\python.exe" (
  echo Execute scripts\instalar_ambiente_windows.ps1 primeiro.
  exit /b 1
)
start "BZtune API" cmd /k "cd /d doomvault-api && .venv\Scripts\python.exe app.py"
start "BZtune Web" cmd /k "cd /d doomvault && npm run dev"
echo Os servidores foram iniciados. Confira o endereco exibido pelo Vite.
