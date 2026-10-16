# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# ---- Set build-time environment variables ----
ARG REACT_APP_API_BASE_URL
ARG REACT_APP_GOOGLE_SITE_VERIFICATION

ENV VITE_API_BASE_URL=$REACT_APP_API_BASE_URL
ENV VITE_GOOGLE_SITE_VERIFICATION=$REACT_APP_GOOGLE_SITE_VERIFICATION
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
