# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build backend ────────────────────────────────────────────────────
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

COPY data/brands/ ./data/brands/
COPY data/calibration/ ./data/calibration/
COPY campaigns/ ./campaigns/

RUN mkdir -p data/results

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/server.js"]
