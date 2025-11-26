# FRONTEND Dockerfile (Vite Build + Nginx Serve)

# === Stage 1: Build Frontend ===
FROM node:18 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# === Stage 2: Serve with nginx ===
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
