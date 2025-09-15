# Staging Deployment Guide: websocket-service

## Platform Recommendation
Use [Render](https://render.com/) or [Railway](https://railway.app/) for free Node.js deployments. Both support Docker and environment variables.

## Prerequisites
- GitHub repository access
- Dockerfile (already provided)
- MongoDB Atlas connection string (if needed for future updates)
- Azure Blob Storage credentials

## Environment Variables
Set these in the platform dashboard (do not commit secrets):
- `PORT` (default: 3000)
- `APPLICATIONINSIGHTS_CONNECTION_STRING` (from Azure)
- `AZURE_STORAGE_ACCOUNT_NAME` (from Azure)
- `AZURE_BLOB_STORAGE` (your Azure blob connection string)
- `MONGODB_URI` 
- `NODE_ENV=staging`

## Deployment Steps
1. Push your code to GitHub.
2. On Render/Railway, create a new Web Service and connect your repo.
3. Select Dockerfile for build (or set build command: `npm install`, start command: `npm start`).
4. Add environment variables in the dashboard.
5. Deploy the service.

## Testing Endpoints
Example cURL command:
```
curl -X GET https://your-staging-url.onrender.com/health
```
Replace with actual endpoints as needed.

## Seeding Sample Data
- Use MongoDB Atlas dashboard to insert sample data if/when the service uses MongoDB.

## Isolation
- Use the provided staging MongoDB URI and Azure credentials.
- Do not commit secrets; use .env locally and platform env vars in staging.

## Notes
- Update code to use environment variables for all secrets and configuration.
- For Python services, set `PYTHON_ENV=staging` and other relevant variables similarly.

---
For further details, see platform documentation:
- [Render Node.js Guide](https://render.com/docs/nodejs)
- [Railway Node.js Guide](https://docs.railway.app/guides/nodejs)

