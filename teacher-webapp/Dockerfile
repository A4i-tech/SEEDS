# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build && rm build/env.js

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
