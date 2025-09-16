# SEEDS Backend Server Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Fly.io](https://fly.io) (permanent free tier)
- [Deta](https://deta.space) is another option for some Python apps
- Note: [Railway](https://railway.app) only offers a 30-day trial and is not always free
- All recommended platforms support Docker and Python apps

## 2. Repository Connection
- Connect your GitHub repository to the chosen platform
- Select the appropriate branch for deployment (e.g., `main` or `a4i/main`)

## 3. Environment Variables
Set these in the platform dashboard (do NOT commit secrets):
```
PORT=4000
MONGODB_URI=<your-mongodb-atlas-connection-string>
SECRET_KEY=<your-staging-secret>
AZURE_STORAGE_CONNECTION_STRING=<your-azure-storage-connection-string>
AZURE_STORAGE_ACCOUNT_NAME=<your-azure-storage-account-name>
AZURE_STORAGE_ACCOUNT_KEY=<your-azure-storage-account-key>
IVR_SERVER_URL=<your-ivr-server-url>
CONF_SERVER_URL=<your-conf-server-url>
FIREBASE_SERVICE_ACCOUNT=<path-to-your-firebase-service-account-json>
```

> **Note:** Only include variables relevant to your service. Do not commit secrets to version control.

## 4. MongoDB Atlas Integration
- Ensure `MONGODB_URI` is set to the provided Atlas connection string.
- The code will automatically use this for all DB operations.

## 5. Preparing for Deployment
- Ensure your code is pushed to the correct branch
- Confirm all dependencies are listed (e.g., `requirements.txt` or `package.json`)
- Ensure a `Dockerfile` is present in the project root

## 6. Deploying on Render/Fly.io
1. Create a new Web Service and connect your GitHub repo
2. Select Docker as the build method
3. Set environment variables as above
4. Deploy and monitor logs for successful startup

## 7. Testing Endpoints
Open your deployed app in the browser and visit to verify it loads
```
http://<endpoint-url>/docs
```

## 8. Staging Isolation
- Use separate DB, secrets, and endpoints for staging
- Never share production secrets with staging

## 9. Sample Data Seeding
- Use MongoDB Atlas UI or a script to seed sample data

## 10. Troubleshooting
- Check platform logs for errors
- Ensure all environment variables are set
- Validate external service connections (e.g., MongoDB, Azure, Vonage)

---
For further help, see platform documentation or contact your admin.

