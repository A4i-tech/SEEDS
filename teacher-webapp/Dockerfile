# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# ---- Set build-time environment variables ----
# These env vars will be baked into the React static build
ARG REACT_APP_CONF_SERVER_BASE_URI
ARG REACT_APP_STORAGE_ACCOUNT_NAME
ARG REACT_APP_API_BASE_URL

ENV REACT_APP_CONF_SERVER_BASE_URI=$REACT_APP_CONF_SERVER_BASE_URI
ENV REACT_APP_STORAGE_ACCOUNT_NAME=$REACT_APP_STORAGE_ACCOUNT_NAME
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

# Copy build output to nginx html directory
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
