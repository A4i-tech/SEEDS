# ConferenceV2 Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Railway](https://railway.app)
- Both support Docker and free tier for Python apps

## 2. Preparing for Deployment
- Ensure your code is pushed to the `a4i/main` branch
- Confirm `requirements.txt` lists all dependencies
- Dockerfile is present in the project root

## 3. Environment Variables
Set these in the platform dashboard (do NOT commit secrets):
- `MONGODB_URI` (use your provided Atlas connection string)
- `PYTHON_ENV=staging`
- `AZURE_BLOB_STORAGE` (if required)
- Any other secrets required by your app

## 4. Deploying on Render
1. Create a new Web Service, connect your GitHub repo
2. Select Docker as the build method
3. Set environment variables as above
4. Deploy and monitor logs for successful startup

## 5. Testing Endpoints
Use cURL to verify endpoints (replace `<ENDPOINT>` as needed):
```sh
curl -X GET https://<your-app-url>/health
curl -X POST https://<your-app-url>/conference/start -d '{"param": "value"}' -H "Content-Type: application/json"
```

## 6. Staging Isolation
- Use separate DB, secrets, and endpoints for staging
- Never share production secrets with staging

## 7. Sample Data Seeding
- Use MongoDB Atlas UI or a script to seed sample data

## 8. Notes
- All configuration should use environment variables
- `.env` should be in `.gitignore`
- Update your code to use `get_settings().MONGODB_URI` for MongoDB connections

---
For further help, see platform documentation or contact your admin.

