# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# ---- Set build-time environment variables ----
# These env vars will be baked into the React static build
ARG REACT_APP_API_BASE_URL
ARG REACT_APP_GOOGLE_SITE_VERIFICATION

ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL
ENV REACT_APP_GOOGLE_SITE_VERIFICATION=$REACT_APP_GOOGLE_SITE_VERIFICATION
# Build React app
RUN npm run build

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy React build output to Nginx
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

USER 101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
