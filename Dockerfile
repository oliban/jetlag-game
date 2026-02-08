# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# VITE_MAPBOX_TOKEN must be available at build time for Vite to embed it
ARG VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built client assets
COPY --from=builder /app/dist ./dist

# Copy server source (tsx runs TypeScript directly)
COPY --from=builder /app/server ./server

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npx", "tsx", "server/index.ts"]
