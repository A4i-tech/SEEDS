@echo off
setlocal enabledelayedexpansion

:: ==========================================================
:: Configuration variables
:: ==========================================================
set "APK_PATH=app\build\outputs\apk\debug\app-debug.apk"
set "PACKAGE_NAME=com.example.seeds"
set "MAIN_ACTIVITY=com.example.seeds.ui.Login.SplashScreenActivity"
set "BUILD_DIR=app\build"

:: ==========================================================
:: Script logic
:: ==========================================================

echo Starting the clean build and run process for %PACKAGE_NAME%...

:: Step 0: Stop Gradle daemons
echo 0. Stopping any running Gradle daemons...
call gradlew --stop
echo Gradle daemons stopped.

:: Step 0.5: Force delete build folder
if exist "%BUILD_DIR%" (
    echo 0.5. Force deleting build folder to avoid file locks...
    set tries=0
    :delete_loop
    rmdir /s /q "%BUILD_DIR%" 2>nul
    if exist "%BUILD_DIR%" (
        set /a tries+=1
        if !tries! geq 5 (
            echo Error: Could not delete build folder after multiple attempts. Close all programs using it.
            pause
            exit /b 1
        )
        timeout /t 2 > nul
        goto delete_loop
    )
    echo Build folder deleted successfully.
)

:: Step 1: Clean the project
echo 1. Cleaning the project...
call gradlew clean
if %errorlevel% neq 0 (
    echo Warning: Gradle clean failed, but build folder was already deleted. Continuing...
) else (
    echo Project cleaned.
)

:: Step 2: Build the debug APK
echo 2. Building the debug APK...
call gradlew assembleDebug --parallel
if %errorlevel% neq 0 (
    echo Error: Gradle build failed. Exiting.
    pause
    exit /b %errorlevel%
)
echo APK built successfully.

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

@REM :: Step 3.5: Reverse TCP port for local server
@REM echo 3.5. Setting up adb reverse for local server port 9210...
@REM adb reverse tcp:9210 tcp:9210
@REM adb reverse tcp:4000 tcp:4000
@REM if %errorlevel% neq 0 (
@REM     echo Warning: Failed to set up adb reverse. Your app may not reach the local server.
@REM ) else (
@REM     echo adb reverse set successfully.
@REM )

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
