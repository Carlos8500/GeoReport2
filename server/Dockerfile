FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Se copia el proyecto de la API (ver .dockerignore).
# Si server/node_modules ya existe en la PC (npm install), se reutiliza y la
# imagen se construye sin internet. Esto evita fallas cuando un antivirus
# (p. ej. AVG "HTTPS scanning") intercepta las descargas dentro de Docker.
# Las dependencias (express, pg, cors) son JavaScript puro: funcionan igual
# en Windows y en Linux.
COPY . .
RUN if [ ! -d node_modules ]; then npm ci --omit=dev --no-audit --no-fund; fi

USER node
EXPOSE 4000
CMD ["node", "src/index.js"]
