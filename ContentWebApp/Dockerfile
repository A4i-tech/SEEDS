# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build React app
RUN npm run build && rm build/env.js

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy React build output to Nginx
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

# Unhealthy until the deploy target mounts /etc/app-config/env.js.
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/env.js || exit 1

CMD ["nginx", "-g", "daemon off;"]
