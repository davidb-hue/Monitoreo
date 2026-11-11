# =====================================================================
#  Pizarra de Monitoreo – imagen única (servidor Express + frontend Vue)
#  El servidor compila el frontend y lo sirve; la base de datos va aparte
#  (contenedor postgres en docker-compose.yml).
# =====================================================================

# ---------- build: instala todo y compila el frontend Vue ----------
FROM node:20-slim AS build
WORKDIR /app

# Copiamos primero los package.json para aprovechar la caché de capas
COPY package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
RUN npm install

# Código y compilación: vite build --mode rest -> apps/web/dist
COPY . .
RUN npm run build

# Quitamos dependencias de desarrollo (vite, etc.) para aligerar la imagen final
RUN npm prune --omit=dev

# ---------- run: solo el servidor Express sirviendo el dist ----------
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3000
CMD ["node", "apps/server/src/index.js"]
