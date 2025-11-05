# SEEDS Teacher App — Android
---
## Table of Contents

1. [Prerequisites](#prerequisites)
2. [First-Time Setup](#first-time-setup)
3. [Environment Configuration](#environment-configuration)
4. [Available Fastlane Lanes](#available-fastlane-lanes)
5. [How the Automation Works](#how-the-automation-works)
6. [CI/CD Integration](#cicd-integration)

---

## ⚙️ Prerequisites

Ensure the following tools are installed before proceeding:

| Tool | Purpose | Installation / Notes |
|------|----------|----------------------|
| **Android Studio** | Official IDE for Android development | [Download](https://developer.android.com/studio) |
| **JDK 17** | Required Java Development Kit | Use the latest LTS build |
| **Ruby (v3.2.x)** | Required to run Fastlane | [RubyInstaller for Windows](https://rubyinstaller.org/downloads/) |
| **Bundler** | Ruby dependency manager | Install via `gem install bundler` |
| **Firebase CLI** | For interacting with Firebase services | [Firebase CLI Setup](https://firebase.google.com/docs/cli#setup_update_cli) |

---

## 🚀 First-Time Setup

Follow these steps to get started with local development and deployment.

### 1. Clone the Repository
```sh
git clone https://github.com/A4i-tech/SEEDS.git
cd Teacher-App
```

### 2. Install Ruby Dependencies
This installs `fastlane` and all required gems defined in the `Gemfile`:
```sh
bundle install
```

### 3. Log In to Firebase
Authenticate your machine with Firebase:
```sh
firebase login
```

### 4. Create the Environment Configuration File
See the [Environment Configuration](#environment-configuration) section for setup instructions.

### 5. Open the Project in Android Studio
Allow Gradle to sync and fetch required dependencies.

---

## Environment Configuration

The project uses an environment file (`fastlane/.env`) to store secrets and environment-specific URLs.  
This file is **not tracked** in Git and must be created manually.

### Steps

1. Navigate to the `fastlane` directory:
   ```sh
   cd fastlane
   ```
2. Create a file named `.env`.
3. Copy and fill in the following template:

#### `.env` Template
```env
# --- API URLs for Staging ---
BASE_URL="https://your-staging-base-url.onrender.com"
CONTENT_URL="https://your-staging-content-url.onrender.com"

# --- Firebase Secrets ---
# Firebase App ID (from Firebase Console -> Project Settings -> Your Apps)
FIREBASE_APP_ID="1:1234567890:android:123abcde456fabc"

# Firebase Tester Groups (App Distribution -> Testers & Groups)
FIREBASE_TESTER_GROUPS="qa-team"

# Firebase CI Token (run `firebase login:ci` to generate)
FIREBASE_CLI_TOKEN="1//04_your_secret_refresh_token_here"
```

>**Note:** Add `fastlane/.env` to your `.gitignore` file to avoid committing sensitive information.

---

## Available Fastlane Lanes

All Fastlane tasks are defined in `fastlane/Fastfile`.  
Run any lane with the following command:

```sh
bundle exec fastlane <lane_name>
```

### `deploy_staging`

Builds and uploads the staging APK to Firebase App Distribution.

**Command:**
```sh
bundle exec fastlane deploy_staging
```

**What it does:**
1. Reads configuration from `fastlane/.env`.
2. Builds a **debug APK**.
3. Injects `BASE_URL` and `CONTENT_URL` into the app during compilation.
4. Uploads the APK to **Firebase App Distribution**.
5. Notifies all testers in `FIREBASE_TESTER_GROUPS`.

