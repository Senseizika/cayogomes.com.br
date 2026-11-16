@echo off
rem Atualiza a cor de destaque de cada fundo e grava no index.html.
rem Rode este arquivo depois de adicionar ou trocar imagens em img\Fundo.
cd /d "%~dp0.."
node "tools\paleta.js" %*
echo.
pause
