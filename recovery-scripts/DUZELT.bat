@echo off
chcp 65001 >nul
title KATIP TEK TIK DUZELTME

echo.
echo KATIP DUZELTME BASLIYOR...
echo Lutfen Katip uygulamasinin kapali oldugundan emin olun.
echo.

set "KATIP=%APPDATA%\Kâtip"
set "SOURCE=%KATIP%\kurtarma-20260717_140744\zip-acilimlari\zip-1"
set "SOURCE_DB=%SOURCE%\database\otoservis.db"
set "ACTIVE_DB=%KATIP%\otoservis.db"
set "ACTIVE_PHOTOS=%KATIP%\fotograflar"

if not exist "%SOURCE_DB%" (
  echo HATA: Kurtarilacak veritabani bulunamadi:
  echo %SOURCE_DB%
  echo.
  pause
  exit /b 1
)

for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set D=%%a%%b%%c
for /f "tokens=1-3 delims=:,." %%a in ("%time%") do set T=%%a%%b%%c
set "STAMP=%D%_%T%"
set "SAFE=%KATIP%\manuel-guvenlik-%STAMP%"

mkdir "%SAFE%" >nul 2>&1

if exist "%ACTIVE_DB%" copy /Y "%ACTIVE_DB%" "%SAFE%\onceki-otoservis.db" >nul
if exist "%ACTIVE_PHOTOS%" xcopy "%ACTIVE_PHOTOS%" "%SAFE%\fotograflar\" /E /I /H /Y >nul

del /Q "%ACTIVE_DB%-wal" "%ACTIVE_DB%-shm" >nul 2>&1
copy /Y "%SOURCE_DB%" "%ACTIVE_DB%" >nul

if exist "%SOURCE%\fotograflar" (
  if exist "%ACTIVE_PHOTOS%" rmdir /S /Q "%ACTIVE_PHOTOS%"
  xcopy "%SOURCE%\fotograflar" "%ACTIVE_PHOTOS%\" /E /I /H /Y >nul
)

set "ELECTRON_RUN_AS_NODE=1"
".\node_modules\electron\dist\electron.exe" ".\katip-onar.cjs"
set "RESULT=%ERRORLEVEL%"
set "ELECTRON_RUN_AS_NODE="

echo.
if "%RESULT%"=="0" (
  echo TAMAM: Veritabani ve fotograflar geri getirildi.
  echo Simdi terminalde npm run dev yaz.
) else (
  echo HATA: Onarma tamamlanamadi. Eski veriler silinmedi.
  echo Guvenlik kopyasi: %SAFE%
)
echo.
pause
exit /b %RESULT%
