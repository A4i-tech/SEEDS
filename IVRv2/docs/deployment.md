# IVRv2 Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Fly.io](https://fly.io) (both have a permanent free tier)
- [Deta](https://deta.space) is another option for some Python apps
- Note: [Railway](https://railway.app) only offers a 30-day trial and is not always free
- All recommended platforms support Docker and Python apps

## 2. Preparing for Deployment
- Connect your GitHub repository to the chosen platform
- Select the appropriate branch for deployment (e.g., `main` or `a4i/main`)

## 3. Environment Variables
Set these in the platform dashboard (do NOT commit secrets):
```
VONAGE_API_KEY=<your-vonage-api-key>
VONAGE_API_SECRET=<your-vonage-api-secret>
VONAGE_APPLICATION_ID=<your-vonage-application-id>
VONAGE_PRIVATE_KEY=<your-vonage-private-key>
BASE_URL=<your-base-url>
AZURE_COSMOS_ENDPOINT=<your-azure-cosmos-endpoint>
AZURE_COSMOS_KEY=<your-azure-cosmos-key>
AZURE_STORAGE_CONNECTION_STRING=<your-azure-storage-connection-string>
MONGODB_URI=<your-mongodb-atlas-connection-string>
PYTHON_ENV=staging
BLOB_STORE_CONN_STR=<your-azure-blob-storage>
```

> **Note:** Only include variables relevant to your service. Do not commit secrets to version control.

## 4. Deploying on Render/Fly.io
1. Create a new Web Service and connect your GitHub repo
2. Select Docker as the build method
3. Set environment variables as above
4. Deploy and monitor logs for successful startup

## 5. Testing Endpoints
Open your deployed app in the browser and visit to verify it loads
```
http://<endpoint-url>/docs
```


## 6. Staging Isolation
- Use separate DB, secrets, and endpoints for staging
- Never share production secrets with staging

## 7. Sample Data Seeding
- Use MongoDB Atlas UI or a script to seed sample data
- Example: Insert a test IVR workflow or user

## 8. Troubleshooting
- Check platform logs for errors
- Ensure all environment variables are set
- Validate external service connections (e.g., MongoDB, Azure, Vonage)
- Make sure your MongoDB Atlas IP whitelist allows connections from the platform

---
For further help, see platform documentation or contact your admin.

