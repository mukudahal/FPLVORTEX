FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Debian runtime supplies Python manylinux SciPy wheels; the static Vite build
# stage stays unchanged. This is an optional, rate-limited no-chip solver.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV VORTEX_EXACT_PYTHON=/opt/vortex-milp/bin/python
ENV OPENBLAS_NUM_THREADS=1
ENV OMP_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/vortex-milp && /opt/vortex-milp/bin/pip install --no-cache-dir \
  'numpy>=2,<3' 'scipy>=1.14,<2' 'pydantic>=2,<3'
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/brand-kit ./brand-kit
COPY --from=build /app/server ./server
COPY --from=build /app/fpl_solver ./fpl_solver
COPY --from=build /app/data/fpl-match-history ./data/fpl-match-history
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/3_data_third_party ./3_data_third_party
COPY --from=build /app/site/ui/videos.json ./site/ui/videos.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
USER node
CMD ["./node_modules/.bin/tsx", "server/index.ts"]
