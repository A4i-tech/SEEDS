# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# ---- Set build-time environment variables ----
# These env vars will be baked into the Vite static build
ARG VITE_API_BASE_URL

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Build app
RUN npm run build

# ---- Production stage ----
FROM nginxinc/nginx-unprivileged:alpine

# Copy build output to Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
