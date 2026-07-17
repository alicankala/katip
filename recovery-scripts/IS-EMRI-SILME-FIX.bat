@echo off
chcp 65001 >nul
title KATIP IS EMRI SILME FIX

echo.
echo Is emri silme hatasi duzeltiliyor...
echo.

node .\is-emri-silme-fix.cjs

echo.
echo Bitti. Simdi terminalde:
echo Remove-Item -Recurse -Force .\dist-electron -ErrorAction SilentlyContinue
echo npm run dev
echo.
pause
