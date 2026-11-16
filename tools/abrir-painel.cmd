@echo off
rem Abre o painel para publicar e apagar projetos.
rem Deixe esta janela aberta enquanto usa o painel; feche-a para parar.
cd /d "%~dp0.."
node "tools\painel.js" %*
if errorlevel 1 pause
