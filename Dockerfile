# syntax=docker/dockerfile:1
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY package.json ./
COPY CHANGELOG.md ./
COPY src ./src

EXPOSE 3000
CMD ["bun", "run", "start"]
