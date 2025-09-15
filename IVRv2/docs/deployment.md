# IVR v2 Staging Deployment Guide

This guide describes how to deploy the IVR v2 application to a free staging environment using Docker and MongoDB Atlas.

## 1. Prerequisites
- GitHub account and repository access
- MongoDB Atlas staging connection string
- Vonage and Azure credentials for staging
- Free account on Render (https://render.com) or Railway (https://railway.app)

## 2. Prepare Your Environment
- Ensure your code is up to date in the `a4i/main` branch.
- Copy secrets to `.env` and fill in your staging credentials. **Do not commit secrets.**

## 3. Deploy to Render or Railway
### Render
1. Log in to Render and create a new Web Service.
2. Connect your GitHub repository and select the IVRv2 directory.
3. Choose "Docker" as the environment.
4. Set environment variables in the Render dashboard using `.env.staging.example` as a reference.
5. Deploy the service.

### Railway
1. Log in to Railway and create a new project.
2. Link your GitHub repository and select the IVRv2 directory.
3. Add a "Service" and choose "Dockerfile".
4. Set environment variables in the Railway dashboard using `.env` as a reference.
5. Deploy the service.

## 4. Environment Variables
Set the following variables in your platform dashboard:
- VONAGE_API_KEY
- VONAGE_API_SECRET
- VONAGE_APPLICATION_ID
- VONAGE_PRIVATE_KEY
- AZURE_COSMOS_ENDPOINT
- AZURE_COSMOS_KEY
- AZURE_STORAGE_CONNECTION_STRING
- MONGODB_URI (use the provided Atlas string)
- PYTHON_ENV=staging
- AZURE_BLOB_STORAGE

## 5. Seed Sample Data
- Use MongoDB Atlas UI or scripts to insert sample documents into your staging database.
- Example: Insert a test IVR workflow or user.

## 6. Test Endpoints
After deployment, verify the app is running (e.g., https://your-app.onrender.com or Railway URL).

### Example cURL Requests
#### Health Check
```
curl https://your-app.onrender.com/docs
```

## 7. Troubleshooting
- Check logs in the platform dashboard for errors.
- Ensure all environment variables are set correctly.
- Make sure your MongoDB Atlas IP whitelist allows connections from the platform.

## 8. Notes
- Staging environment is fully isolated from production.
- Do not commit secrets or production credentials.
- For support, open an issue or contact the maintainer.

