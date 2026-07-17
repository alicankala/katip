@echo off
chcp 65001 >nul
title KATIP YEDEKTEN GERI YUKLE BUTON DUZELT

echo.
echo Yedekten Geri Yukle butonu duzeltiliyor...
echo Bu dosyayi dukkan-arayuz ana klasorunde calistir.
echo.

node .\buton-duzelt.cjs

echo.
echo Bitti. Simdi terminalde:
echo Remove-Item -Recurse -Force .\dist-electron -ErrorAction SilentlyContinue
echo npm run dev
echo.
pause
