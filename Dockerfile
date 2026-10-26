FROM node:24.16.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global npm@11.13.0
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ENV NX_DAEMON=false
RUN npx nx run-many -t build -p web api --output-style=static

FROM node:24.16.0-bookworm-slim AS production-dependencies
WORKDIR /app
RUN npm install --global npm@11.13.0
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24.16.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000 WEB_ROOT=/app/web
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/api ./api
COPY --from=build /app/dist/apps/web/browser ./web
RUN mkdir -p /app/data/assets && chown node:node /app/data/assets
USER node
EXPOSE 3000
CMD ["node", "api/main.js"]
