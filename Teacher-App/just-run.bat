@echo off
setlocal enabledelayedexpansion

:: Configuration variables
set "APK_PATH=app\build\outputs\apk\debug\app-debug.apk"
set "PACKAGE_NAME=com.example.seeds"
set "MAIN_ACTIVITY=com.example.seeds.ui.Login.SplashScreenActivity"
set "BUILD_DIR=app\build"

:: Default to not reversing TCP ports
set "REVERSE_TCP=false"

:: Check for command-line argument to enable TCP reverse
if /i "%~1"=="reverse" (
    set "REVERSE_TCP=true"
    echo TCP reverse explicitly enabled via command-line argument.
) else if not "%~1"=="" (
    echo Unknown argument: %1. Continuing without TCP reverse.
)

:: Script logic

@REM echo Starting the clean build and run process for %PACKAGE_NAME%...

@REM :: Step 0: Stop Gradle daemons
@REM echo 0. Stopping any running Gradle daemons...
@REM call gradlew --stop
@REM echo Gradle daemons stopped.

@REM :: Step 0.5: Force delete build folder
@REM if exist "%BUILD_DIR%" (
@REM     echo 0.5. Force deleting build folder to avoid file locks...
@REM     set tries=0
@REM     :delete_loop
@REM     rmdir /s /q "%BUILD_DIR%" 2>nul
@REM     if exist "%BUILD_DIR%" (
@REM         set /a tries+=1
@REM         if !tries! geq 5 (
@REM             echo Error: Could not delete build folder after multiple attempts. Close all programs using it.
@REM             pause
@REM             exit /b 1
@REM         )
@REM         timeout /t 2 > nul
@REM         goto delete_loop
@REM     )
@REM     echo Build folder deleted successfully.
@REM )

@REM :: Step 1: Clean the project
@REM echo 1. Cleaning the project...
@REM call gradlew clean
@REM if %errorlevel% neq 0 (
@REM     echo Warning: Gradle clean failed, but build folder was already deleted. Continuing...
@REM ) else (
@REM     echo Project cleaned.
@REM )

@REM :: Step 2: Build the debug APK
@REM echo 2. Building the debug APK...
@REM call gradlew assembleDebug
@REM if %errorlevel% neq 0 (
@REM     echo Error: Gradle build failed. Exiting.
@REM     pause
@REM     exit /b %errorlevel%
@REM )
@REM echo APK built successfully.

:: Step 3: Check for connected devices
echo 3. Checking for connected devices...
adb devices > nul
adb devices | find "device" > nul
if %errorlevel% neq 0 (
    echo Error: No devices found. Please ensure your device is connected and USB debugging is enabled.
    pause
    exit /b 1
)
echo Device found.

:: Step 3.5: Conditionally Reverse TCP port for local server
if "%REVERSE_TCP%"=="true" (
    echo 3.5. Setting up adb reverse for local server port 9210 and 4000...
    adb reverse tcp:9210 tcp:9210
    adb reverse tcp:4000 tcp:4000
    if %errorlevel% neq 0 (
        echo Warning: Failed to set up adb reverse. Your app may not reach the local server.
    ) else (
        echo adb reverse set successfully.
    )
) else (
    echo 3.5. Skipping adb reverse as it was not requested.
)


:: Step 4: Install the APK
echo 4. Installing %APK_PATH% on the device...
adb install -r "%APK_PATH%"
if %errorlevel% neq 0 (
    echo Error: Installation failed.
    pause
    exit /b 1
)
echo App installed successfully.

:: Step 5: Launch main activity
echo 5. Launching the main activity: %MAIN_ACTIVITY%...
adb shell am start -S -n "%PACKAGE_NAME%/%MAIN_ACTIVITY%" 
echo App launch command sent.

echo Done.
pause
endlocal