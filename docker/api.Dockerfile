FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/map-core/package.json packages/map-core/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/offline/package.json packages/offline/package.json
COPY packages/services/package.json packages/services/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/map-import/package.json packages/map-import/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @multivus/api build
COPY docker/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3333
CMD ["/entrypoint.sh"]
