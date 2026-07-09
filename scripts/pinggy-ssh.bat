@echo off
chcp 65001 >nul
set PORT=%PORT%
if "%PORT%"=="" set PORT=3000
echo [Pinggy] Туннель к http://127.0.0.1:%PORT%
echo Скопируй HTTPS-ссылку из вывода ниже и открой на телефоне.
echo.
ssh -p 443 -R0:127.0.0.1:%PORT% -o StrictHostKeyChecking=no qr@free.pinggy.io
