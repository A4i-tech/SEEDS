# ContentWebApp Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Fly.io](https://fly.io) (both have a permanent free tier)
- [Deta](https://deta.space) is another option for some Python/Node.js apps
- Note: [Railway](https://railway.app) only offers a 30-day trial and is not always free
- All recommended platforms support Docker and Node.js/React apps

## 2. Preparing for Deployment
- Connect your GitHub repository to the chosen platform
- Select the appropriate branch for deployment (e.g., `main` or `a4i/main`)

## 3. Environment Variables
Set these in the platform dashboard (do NOT commit secrets):
```
REACT_APP_API_BASE_URL=<your-backend-api-url>
REACT_APP_FIREBASEAPIKEY=<your-firebase-api-key>
REACT_APP_FIREBASEAUTHDOMAIN=<your-firebase-auth-domain>
REACT_APP_FIREBASEPROJECTID=<your-firebase-project-id>
REACT_APP_FIREBASESTORAGEBUCKET=<your-firebase-storage-bucket>
REACT_APP_FIREBASEMESSAGINGSENDERID=<your-firebase-messaging-sender-id>
REACT_APP_FIREBASEAPPID=<your-firebase-app-id>
REACT_APP_FIREBASEMEASUREMENTID=<your-firebase-measurement-id>
```


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
- Use scripts or platform UI to seed sample data if required

## 8. Troubleshooting
- Check platform logs for errors
- Ensure all environment variables are set
- Validate external service connections (e.g., Firebase, backend API)

---
For further help, see platform documentation or contact your admin.
