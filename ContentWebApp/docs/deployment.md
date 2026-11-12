# ContentWebApp Staging Deployment Guide

## 1. Platform Choice
- Recommended: [Render](https://render.com) or [Fly.io](https://fly.io) (both have a permanent free tier)
- [Deta](https://deta.space) is another option for some Python/Node.js apps
- Note: [Railway](https://railway.app) only offers a 30-day trial and is not always free
- All recommended platforms support Docker and Node.js/React apps

## 2. Preparing for Deployment
- Connect your GitHub repository to the chosen platform
- Select the appropriate branch for deployment (e.g., `main` or `a4i/main`)

## 3. Runtime Configuration
The image holds no environment values. Set these as container environment variables when the container starts:
```
REACT_APP_API_BASE_URL=<value>
REACT_APP_STORAGE_ACCOUNT_NAME=<value>
REACT_APP_GOOGLE_SITE_VERIFICATION=<value>
```

The build puts a placeholder in the bundle for each variable. The start script `runtime-env.sh` replaces each placeholder with the variable value, then starts nginx.

If a variable is missing or empty, the container exits with an error that names the variable. Set it and restart.

A value must not contain `"`, `\`, `<`, `&`, `|`, or a control character.

Every browser can read these values. Never put a secret in them.

Set each value in every environment before the first deploy of this image. Take the value from the old GitHub variable or secret in this table.

| Variable | Old GitHub variable or secret (value source) |
|---|---|
| `REACT_APP_API_BASE_URL` | CONTENT_WEBAPP_REACT_APP_API_BASE_URL (prod), CONTENT_WEBAPP_REACT_APP_API_BASE_URL_STAGING (staging) |
| `REACT_APP_STORAGE_ACCOUNT_NAME` | CONTENT_WEBAPP_STORAGE_ACCOUNT_NAME |
| `REACT_APP_GOOGLE_SITE_VERIFICATION` | CONTENT_WEBAPP_REACT_APP_GOOGLE_SITE_VERIFICATION |

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
