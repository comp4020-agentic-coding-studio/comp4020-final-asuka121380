# syntax = docker/dockerfile:1

# Two stages: build the React client with Vite, then run the Express server
# with production dependencies only. The server is TypeScript that node runs
# directly (type stripping), so only the client has a build step. It serves
# HTTP on 0.0.0.0:$PORT and publishes README.md at /readme/, as fly.toml and
# spec/README.md require; its database lives on the /data volume.

FROM docker.io/library/node:24.21.0-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm build

FROM docker.io/library/node:24.21.0-slim
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src/domain ./src/domain
COPY src/server ./src/server
COPY --from=build /app/dist/client ./dist/client
COPY README.md ./
COPY docs ./docs
# the machine has 256 MB; keep the heap well inside it
CMD ["node", "--max-old-space-size=160", "src/server/index.ts"]
