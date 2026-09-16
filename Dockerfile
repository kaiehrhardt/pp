# syntax=docker/dockerfile:1@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32
FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS base
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
