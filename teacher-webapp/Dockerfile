# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ---- Serve stage ----
FROM nginxinc/nginx-unprivileged:alpine

# Copy build output to nginx html directory
COPY --from=builder --chown=nginx:nginx /app/build /usr/share/nginx/html

COPY --chmod=755 runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
