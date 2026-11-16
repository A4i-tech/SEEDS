# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# ---- Set build-time environment variables ----
# These env vars will be baked into the React static build
ARG REACT_APP_STORAGE_ACCOUNT_NAME
ARG REACT_APP_API_BASE_URL

ENV REACT_APP_STORAGE_ACCOUNT_NAME=$REACT_APP_STORAGE_ACCOUNT_NAME
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

RUN npm run build

# ---- Serve stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy build output to nginx html directory
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

# nosemgrep: dockerfile.security.missing-user.missing-user -- base image already runs as non-root
CMD ["nginx", "-g", "daemon off;"]
