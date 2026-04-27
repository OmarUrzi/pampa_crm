FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build
RUN test -f dist/index.js && test -f dist/config.js

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Ensure Node's module resolution matches what we compile for (ESM + extensionless relative imports),
# even if the platform starts the process as `node dist/index.js` without extra CLI flags.
ENV NODE_OPTIONS=--experimental-specifier-resolution=node
RUN apt-get update -y && apt-get install -y openssl ca-certificates libreoffice && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 8787
CMD ["node", "dist/index.js"]

