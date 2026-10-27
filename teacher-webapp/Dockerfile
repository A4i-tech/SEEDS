# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ---- Serve stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy build output to nginx html directory
COPY --from=builder --chown=nginx:nginx /app/build /usr/share/nginx/html

COPY --chmod=755 runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
