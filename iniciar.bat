@echo off
chcp 65001 >nul
cd /d "%~dp0"
python -c "import flask, openpyxl" 2>nul
if errorlevel 1 python -m pip install -r requirements.txt
python app.py
pause
