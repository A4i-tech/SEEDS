# websocket-service Staging Deployment Guide

## 1. How staging deploys

Staging runs on kube-dev, not Render/Fly.io. A push to `a4i/staging` runs `.github/workflows/deploy-websocket-service-staging.yml`, which builds and pushes `ghcr.io/a4i-tech/seeds/websocket-service:staging`. ArgoCD Image Updater on kube-dev watches that tag and rolls the new digest out automatically, no manual deploy step.

## 2. Environment Variables

Runtime config comes from `infra-ops`' `partners/seeds/` manifests and the shared `seeds-platform-secret`, not a platform dashboard. To change a value, update it there and let ArgoCD sync.

## 3. Testing Endpoints

Staging URL comes from the `websocket-service` Ingress on kube-dev — check ArgoCD or `kubectl -n seeds get ingress`.

## 4. Staging Isolation

Kube-dev's `seeds` namespace runs its own DB, secrets, and endpoints, separate from production.

## 5. Troubleshooting

- Check the GitHub Actions run for `deploy-websocket-service-staging.yml` for build/push failures.
- Check ArgoCD for the `websocket-service` Application's sync status on kube-dev.
- `kubectl -n seeds logs` on the `seeds-websocket` pod for runtime errors.

---
For further help, see the `infra-ops` repo or contact your admin.
