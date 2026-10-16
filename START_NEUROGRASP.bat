@echo off
title NeuroGrasp AI Rehabilitation Suite Launcher
color 0A
cls
echo =======================================================================
echo          NEUROGRASP AI sEMG GNN REHABILITATION SUITE
echo =======================================================================
echo.
echo Launching NeuroGrasp Web Application in your default web browser...
echo.
start "" "%~dp0index.html"
echo App launched successfully!
timeout /t 3 >nul
exit
