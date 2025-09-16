# ConferenceV2 Staging Deployment Guide

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
APPLICATIONINSIGHTS_CONNECTION_STRING=<your-azure-connection-string>
ENVIRONMENT=<staging|production|development>
EVENTS_WEBHOOK_EP=<your-events-webhook-endpoint>
STORAGE_ACCOUNT_NAME=<your-storage-account-name>
VONAGE_API_KEY=<your-vonage-api-key>
VONAGE_APPLICATION_ID=<your-vonage-application-id>
VONAGE_NUMBER=<your-vonage-number>
VONAGE_PRIVATE_KEY_PATH=<path-to-your-private-key>
WS_SERVER_EP=<your-websocket-server-endpoint>
SERVICE_BUS_CONNECTION_STRING=<your-service-bus-connection-string>
SharedAccessKeyName=<your-shared-access-key-name>
SharedAccessKey=<your-shared-access-key>
```
> **Note:** Only include variables relevant to your service. Do not commit secrets to version control.

## 4. Deploying on Render
1. Create a new Web Service, connect your GitHub repo
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



## 7. Notes
- All configuration should use environment variables
- `.env` should be in `.gitignore`
- Update your code to use `get_settings().MONGODB_URI` for MongoDB connections

---
For further help, see platform documentation or contact your admin.

