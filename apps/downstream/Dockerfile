# Build context is the repo root so npm workspaces resolve.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/downstream/package.json apps/downstream/
RUN npm ci -w @poolside/downstream --include-workspace-root=false
COPY apps/downstream apps/downstream
RUN npm run build -w @poolside/downstream

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/downstream/package.json apps/downstream/
RUN npm ci -w @poolside/downstream --include-workspace-root=false --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/downstream/dist apps/downstream/dist
USER node
EXPOSE 4001
CMD ["node", "apps/downstream/dist/server.js"]
