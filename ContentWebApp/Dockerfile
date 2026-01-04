# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# ---- Set build-time environment variables ----
# These env vars will be baked into the React static build
ARG REACT_APP_API_BASE_URL

ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

# Build React app
RUN npm run build

# ---- Production stage ----
FROM nginx:alpine

# Copy React build output to Nginx
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
