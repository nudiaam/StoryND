@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando por primera vez...
  call npm install
)
call npm start
