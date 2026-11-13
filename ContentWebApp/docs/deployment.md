# ContentWebApp Staging Deployment Guide

## 1. How staging deploys

Staging runs on kube-dev, not Render/Fly.io. A push to `a4i/staging` runs `.github/workflows/build-staging-images.yml`, which builds the `content-webapp` Docker image and pushes `ghcr.io/a4i-tech/seeds/content-webapp:staging`. ArgoCD Image Updater on kube-dev watches that tag and rolls the new digest out automatically, no manual deploy step.

## 2. Runtime Configuration
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

To change one, update the value where the container runs (the kube-dev secret or the Azure App Setting) and restart the container.

## 3. Testing Endpoints

Staging URL comes from the `content-webapp` Ingress on kube-dev — check ArgoCD or `kubectl -n seeds get ingress`.

## 4. Staging Isolation

Kube-dev's `seeds` namespace runs its own backend, DB, and secrets (`infra-ops` `partners/seeds/`), separate from production.

## 5. Troubleshooting

- Check the GitHub Actions run for `build-staging-images.yml` for build/push failures.
- Check ArgoCD for the `content-webapp` Application's sync status on kube-dev.
- `kubectl -n seeds logs` on the `seeds-content-webapp` pod for runtime errors.

---
For further help, see the `infra-ops` repo or contact your admin.
