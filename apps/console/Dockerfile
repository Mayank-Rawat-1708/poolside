# Build context is the repo root so npm workspaces resolve.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/console/package.json apps/console/
RUN npm ci -w @poolside/console --include-workspace-root=false
COPY apps/console apps/console
RUN npm run build -w @poolside/console

FROM nginx:1.29-alpine
COPY infra/nginx/console.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/console/dist /usr/share/nginx/html
EXPOSE 80
