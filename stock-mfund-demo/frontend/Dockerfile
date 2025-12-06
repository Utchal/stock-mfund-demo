## === Stage 1: Build Frontend ===
FROM node:18-bullseye AS builder

WORKDIR /app

# copy package manifests first to leverage cache
COPY package.json package-lock.json* ./

# use npm ci for deterministic installs (falls back to npm install if no lockfile)
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# copy source and build
COPY . .
ENV CI=true
RUN npm run build

# === Stage 2: Serve with nginx ===
FROM nginx:stable-alpine

# Replace default nginx config with our SPA config (optional but recommended)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built app from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# expose standard HTTP port (nginx listens on 80)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]