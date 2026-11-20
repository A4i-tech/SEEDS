# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

RUN npm run build

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy build output to Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx fills the template from REACT_APP_* env vars at start and exits if one is missing
ENV NGINX_ENVSUBST_FILTER=^REACT_APP_
COPY default.conf.template /etc/nginx/templates/default.conf.template

USER 101

EXPOSE 8080

# nosemgrep: dockerfile.security.missing-user.missing-user -- base image already runs as non-root
CMD ["nginx", "-g", "daemon off;"]
