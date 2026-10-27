# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build React app
RUN npm run build

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:alpine

# Copy React build output to Nginx
COPY --from=builder --chown=nginx:nginx /app/build /usr/share/nginx/html
COPY --from=builder /app/build/index.html /opt/index.html.tpl

COPY --chmod=755 runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
