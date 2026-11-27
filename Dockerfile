# Stage 1: build the web app
FROM node:24-alpine AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# Stage 2: tiny runtime (no dependencies needed by the server)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/web/dist
COPY server/server.mjs server/server.mjs
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "server/server.mjs"]
