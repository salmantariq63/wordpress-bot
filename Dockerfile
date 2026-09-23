FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/prisma/prod.db"
ENV UPLOAD_THEMES_DIR="/data/uploads/themes"

RUN mkdir -p /data/prisma /data/uploads/themes

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm start"]
