@echo off
title Ctrl+Alt+Fighter - servidor local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado. Instale em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo.
  echo  Pasta dist\ nao encontrada nesta pasta. O atalho precisa ficar junto do dist\.
  echo.
  pause
  exit /b 1
)

echo.
echo  Subindo o servidor... o navegador abre sozinho em alguns segundos.
echo.

rem O navegador so pode abrir DEPOIS que a porta estiver aceitando conexao.
rem Este powershell fica testando a porta em paralelo e abre o navegador na
rem hora certa; sem isso o navegador chega antes e mostra "conexao recusada".
start "" /b powershell -NoProfile -WindowStyle Hidden -Command ^
 "for($i=0; $i -lt 60; $i++){ try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 4173); $c.Close(); Start-Process 'http://localhost:4173/'; break } catch { Start-Sleep -Milliseconds 250 } }"

node servidor-local.mjs

echo.
echo  O servidor encerrou. Se apareceu erro acima, me mande o texto.
pause
