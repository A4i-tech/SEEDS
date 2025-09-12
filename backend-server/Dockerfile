# SEEDS Backend Server Dockerfile for Staging/Production
FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["node", "index.js"]

