FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Remove dev dependencies and unnecessary files in a smaller final image
FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/src ./src

USER node

EXPOSE 3000

CMD ["npm", "start"]