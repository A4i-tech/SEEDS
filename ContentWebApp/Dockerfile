# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build React app
ENV REACT_APP_API_BASE_URL=__REACT_APP_API_BASE_URL__ \
    REACT_APP_STORAGE_ACCOUNT_NAME=__REACT_APP_STORAGE_ACCOUNT_NAME__ \
    REACT_APP_GOOGLE_SITE_VERIFICATION=__REACT_APP_GOOGLE_SITE_VERIFICATION__
RUN npm run build

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

USER root
COPY --from=builder /app/build /opt/app
COPY --chmod=755 runtime-env.sh /usr/local/bin/runtime-env.sh
RUN chown 101:0 /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

CMD ["sh", "-c", "runtime-env.sh && exec nginx -g 'daemon off;'"]
