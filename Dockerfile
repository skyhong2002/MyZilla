FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN ./node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/server/index.js
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/web ./dist/web
COPY --from=build /app/dist/server ./dist/server
ENV HOST=0.0.0.0 PORT=18140 MYZILLA_DB=/data/myzilla.sqlite
USER node
EXPOSE 18140
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:18140/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
