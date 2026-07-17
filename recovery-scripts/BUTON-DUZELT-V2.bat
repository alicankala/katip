@echo off
chcp 65001 >nul
title KATIP YEDEKTEN GERI YUKLE BUTON DUZELT V2

echo.
echo Yedekten Geri Yukle butonu V2 ile duzeltiliyor...
echo.

node .\buton-duzelt-v2.cjs

echo.
echo Bitti. Simdi terminalde:
echo Remove-Item -Recurse -Force .\dist-electron -ErrorAction SilentlyContinue
echo npm run dev
echo.
pause
