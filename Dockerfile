FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app

# No `gcompat`: Ragenta needs it because its native modules are glibc-only.
# @libsql/client publishes `@libsql/linux-x64-musl`, so Alpine gets a binding
# built for it and nothing has to be shimmed.
COPY package.json pnpm-lock.yaml tsconfig.json tsup.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

RUN pnpm install --frozen-lockfile && \
    pnpm run build && \
    pnpm prune --prod

FROM base AS runner
WORKDIR /app

# `-G nodejs` is not decoration: without it Alpine's adduser drops the account
# into `nogroup`, and every `--chown=teamora:nodejs` below grants a group the
# process is not in.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 -G nodejs teamora

COPY --from=builder --chown=teamora:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=teamora:nodejs /app/dist /app/dist
COPY --from=builder --chown=teamora:nodejs /app/package.json /app/package.json
# SQL migrations, applied by `node dist/db/migrate.js` as an explicit deploy
# step before this container starts (ADR-012).
COPY --from=builder --chown=teamora:nodejs /app/drizzle /app/drizzle

# DATABASE_PATH lives here. This only covers the unmounted case: a bind mount
# replaces the directory along with its ownership, so the host side has to be
# `chown 1001:1001` before the first deploy or this process cannot open its own
# database — which surfaces only as a health check that never turns green.
# DEPLOYMENT.md carries that step.
RUN mkdir -p /app/data && chown teamora:nodejs /app/data
VOLUME ["/app/data"]

USER teamora
EXPOSE 8080

# Node 22 has a built-in HTTP client, so the runtime image does not need curl.
# Keep this endpoint independent from authentication: Docker only needs to know
# whether the API process and its database connection are ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:8080/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "/app/dist/main.api.js"]
