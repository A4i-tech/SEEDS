# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build React app
RUN npm run build

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy React build output to Nginx
COPY --from=builder --chown=nginx:nginx /app/build /usr/share/nginx/html
COPY --from=builder /app/build/index.html /opt/index.html.tpl

COPY --chmod=755 runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

# nosemgrep: dockerfile.security.missing-user.missing-user -- base image already runs as non-root
CMD ["nginx", "-g", "daemon off;"]
