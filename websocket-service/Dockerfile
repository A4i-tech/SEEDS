FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Remove dev dependencies and unnecessary files in a smaller final image
FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app ./

RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "start"]