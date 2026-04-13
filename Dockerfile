# ── Stage 1: Build backend ────────────────────────────────────────────────────
FROM node:22-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Build frontend ───────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=backend-builder /app/dist ./dist

# Frontend dist trafia do nginx – kopiujemy tu żeby docker cp działał
COPY --from=frontend-builder /frontend/dist ./frontend-dist

# Dane statyczne (jeśli istnieją)
COPY data/brands/ ./data/brands/ 2>/dev/null || true
COPY data/calibration/ ./data/calibration/ 2>/dev/null || true

RUN mkdir -p data/simulations data/results data/temp

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/server.js"]
