# Deployment Guide

## Container Images

- `docker/backend.Dockerfile`: FastAPI backend with Python 3.12 and PySpark dependencies
- `docker/frontend.Dockerfile`: Vite build pipeline with static nginx serving

## Production Considerations

- Replace local volumes with managed storage classes
- Put the backend behind an ingress controller or API gateway
- Move secrets to a vault or platform-native secret store
- Swap `allow_origins=["*"]` for explicit frontend origins
- Add database migrations before multi-environment rollout
- Use a remote Spark Connect endpoint instead of the local Spark master

## Kubernetes And OpenShift Readiness

The project keeps config externalized and storage pluggable so the same app layers can move to Kubernetes or OpenShift with:

- ConfigMaps for `application.yml`
- Secrets for credentials and encryption keys
- PersistentVolumeClaims for uploads and dataset staging
- Separate deployments for frontend, backend, PostgreSQL, and Spark services

