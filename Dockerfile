FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
# postinstall runs prisma generate — schema is not copied yet, so skip scripts here.
RUN npm ci --ignore-scripts

COPY . .

RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/prisma/prod.db"
ENV UPLOAD_THEMES_DIR="/data/uploads/themes"

RUN sed -i 's/\r$//' /app/scripts/docker-entrypoint.sh \
  && mkdir -p /data/prisma /data/uploads/themes \
  && chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

CMD ["/app/scripts/docker-entrypoint.sh"]
