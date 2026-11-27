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
COPY --from=builder /app/build /usr/share/nginx/html

# nginx fills the template from REACT_APP_* env vars at start and exits if one is missing
ENV NGINX_ENVSUBST_FILTER=^(REACT_APP_|NGINX_LOCAL_RESOLVERS)
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
ENV REACT_APP_API_PROXY_TARGET=
COPY default.conf.template /etc/nginx/templates/default.conf.template

USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
