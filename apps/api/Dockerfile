# Build context is the repo root so npm workspaces resolve.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w @poolside/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build -w @poolside/api

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci -w @poolside/api --include-workspace-root=false --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "--import", "./apps/api/dist/obs/tracing.js", "apps/api/dist/server.js"]
