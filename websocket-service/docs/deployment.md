# websocket-service Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Fly.io](https://fly.io) (both have a permanent free tier)
- [Deta](https://deta.space) is another option for some Node.js apps
- Note: [Railway](https://railway.app) only offers a 30-day trial and is not always free
- All recommended platforms support Docker and Node.js apps

## 2. Preparing for Deployment
- Connect your GitHub repository to the chosen platform
- Select the appropriate branch for deployment (e.g., `main` or `a4i/main`)

## 3. Environment Variables
Set these in the platform dashboard (do NOT commit secrets):
```
PORT=<your-port>
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=<your-s3-endpoint-url>
S3_ACCESS_KEY_ID=<your-s3-access-key-id>
S3_SECRET_ACCESS_KEY=<your-s3-secret-access-key>
S3_REGION=<your-s3-region>
```

To store audio in Azure Blob Storage, set `STORAGE_BACKEND=azure` and set these variables instead of the `S3_*` variables:
```
AZURE_STORAGE_ACCOUNT_NAME=<your-azure-storage-account-name>
AZURE_STORAGE_ACCOUNT_KEY=<optional-account-key>
```

If you do not set `AZURE_STORAGE_ACCOUNT_KEY`, the service signs in with `DefaultAzureCredential`.

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
- Use MongoDB Atlas UI or a script to seed sample data if/when the service uses MongoDB

## 8. Troubleshooting
- Check platform logs for errors
- Ensure all environment variables are set
- Validate external service connections (e.g., MongoDB, Azure)

---
For further help, see platform documentation or contact your admin.

