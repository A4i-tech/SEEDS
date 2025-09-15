# SEEDS Backend Server Staging Deployment Guide

## 1. Platform Selection
Recommended free platforms: Render, Railway

## 2. Repository Connection
- Connect your GitHub repository to the chosen platform.
- Select the `main` branch for deployment.

## 3. Environment Variables (Staging)
Set these in the platform dashboard (do NOT commit secrets):

- `PORT=4000`
- `MONGODB_URI=<your_mongodb_atlas_connection_string>`
- `SECRET_KEY=<staging_secret>`
- `AZURE_STORAGE_CONNECTION_STRING=<staging_blob_connection_string>`
- `AZURE_STORAGE_ACCOUNT_NAME=<staging_account_name>`
- `AZURE_STORAGE_ACCOUNT_KEY=<staging_account_key>`
- `IVR_SERVER_URL=<staging_ivr_url>`
- `CONF_SERVER_URL=<staging_conf_url>`
- `FIREBASE_SERVICE_ACCOUNT=<staging_firebase_json_path>`

## 4. MongoDB Atlas Integration
- Ensure `MONGODB_URI` is set to the provided Atlas connection string.
- The code will automatically use this for all DB operations.

## 5. Staging Isolation
- Use separate DB, secrets, and endpoints for staging.
- Never share production credentials with staging.

## 6. Seeding Sample Data
- Use MongoDB Atlas UI or scripts to insert sample data for testing.

## 7. Endpoint Testing (cURL Examples)

```sh
curl -X GET https://<your-staging-app-url>/docs
```

## 8. Troubleshooting
- Check platform logs for errors.
- Ensure all environment variables are set.
- Validate MongoDB Atlas connection.

## 9. Additional Notes
- For multi-app deployments, repeat these steps for each service (IVR, Conf, Websocket, etc.)
- Use platform secrets manager for sensitive values.
- Update documentation as needed for new configs.

