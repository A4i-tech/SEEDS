FROM node:18-alpine AS build

WORKDIR /app

# Copy dependency files first for caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy all source code and build the app
COPY . ./
RUN npm run build


FROM node:18-alpine AS production

WORKDIR /app

# Install a simple static file server
RUN npm install -g serve

# Copy build output from the build stage
COPY --from=build /app/build ./build

# Expose port (default for serve is 3000)
EXPOSE 3000

# Run the static file server
CMD ["serve", "-s", "build", "-l", "3000"]
