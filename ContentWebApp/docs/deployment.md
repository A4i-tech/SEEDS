# ContentWebApp Staging Deployment Guide

## 1. How staging deploys

Staging runs on kube-dev, not Render/Fly.io. A push to `a4i/staging` runs `.github/workflows/deploy-staging.yml`, which builds the `content-webapp` Docker image and pushes `ghcr.io/a4i-tech/seeds/content-webapp:staging`. ArgoCD Image Updater on kube-dev watches that tag and rolls the new digest out automatically, no manual deploy step.

## 2. Environment Variables

Build-time args come from GitHub Actions repo variables/secrets, not a platform dashboard:
- `REACT_APP_STORAGE_ACCOUNT_NAME` ← repo variable `CONTENT_WEBAPP_STORAGE_ACCOUNT_NAME`
- `REACT_APP_API_BASE_URL` ← repo secret `CONTENT_WEBAPP_REACT_APP_API_BASE_URL_STAGING`
- `REACT_APP_GOOGLE_SITE_VERIFICATION` ← repo variable `CONTENT_WEBAPP_REACT_APP_GOOGLE_SITE_VERIFICATION`

To change one, update the repo variable/secret and re-run the workflow, there's no separate dashboard to configure.

## 3. Testing Endpoints

Staging is served at `https://content-webapp-dev.a4i-lab.in`.

## 4. Staging Isolation

Kube-dev's `seeds` namespace runs its own backend, DB, and secrets (`infra-ops` `partners/seeds/`), separate from production.

## 5. Troubleshooting

- Check the GitHub Actions run for `deploy-staging.yml` for build/push failures.
- Check ArgoCD for the `content-webapp` Application's sync status on kube-dev.
- `kubectl -n seeds logs` on the `seeds-content-webapp` pod for runtime errors.

---
For further help, see the `infra-ops` repo or contact your admin.
