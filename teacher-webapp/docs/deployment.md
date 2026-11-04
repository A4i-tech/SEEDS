# Teacher WebApp Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Fly.io](https://fly.io) (both have a permanent free tier)
- [Deta](https://deta.space) is another option for some Node.js/React apps
- Note: [Railway](https://railway.app) only offers a 30-day trial and is not always free
- All recommended platforms support Docker and Node.js/React apps

## 2. Preparing for Deployment
- Connect your GitHub repository to the chosen platform
- Select the appropriate branch for deployment (e.g., `main` or `a4i/main`)

## 3. Runtime Configuration
The image holds no environment values. Mount a file at `/etc/app-config/env.js` when the container starts.

The file has this content:
```js
window.__ENV__ = {
  REACT_APP_API_BASE_URL: "<your-backend-api-url>",
  REACT_APP_STORAGE_ACCOUNT_NAME: "<azure-storage-account-name>",
};
```

If the file is missing, `/env.js` returns 404. The page shows "Could not load /env.js. Check the mount at /etc/app-config/env.js, then restart." Fix the mount and restart.

If a key is missing from the file, the app throws an error that names the key.

Every browser can read `env.js`. Never put a secret in it. Make sure the nginx user (UID 101) can read the file.

Set each value in every environment before the first deploy of this image. Take the value from the old GitHub variable or secret in this table.

| Key in `env.js` | Old GitHub variable or secret (value source) |
|---|---|
| `REACT_APP_API_BASE_URL` | TEACHER_WEBAPP_API_BASE_URL (prod), TEACHER_WEBAPP_API_BASE_URL_STAGING (staging) |
| `REACT_APP_STORAGE_ACCOUNT_NAME` | TEACHER_WEBAPP_STORAGE_ACCOUNT_NAME |

> **Note:** Only include variables relevant to your service. Do not commit secrets to version control.

## 4. Deploying on Render/Fly.io
1. Create a new Web Service and connect your GitHub repo
2. Select Docker as the build method
3. Set environment variables as above
4. Deploy and monitor logs for successful startup

## 5. Testing Endpoints
- Open your deployed app in the browser to verify it loads
- Use browser dev tools or cURL to test API endpoints if needed

## 6. Staging Isolation
Open your deployed app in the browser and visit to verify it loads
```
http://<endpoint-url>/docs
```

## 7. Sample Data Seeding
- Use scripts or platform UI to seed sample data if required

## 8. Troubleshooting
- Check platform logs for errors
- Ensure all environment variables are set
- Validate external service connections (e.g., Firebase, backend API)

---
For further help, see platform documentation or contact your admin.
