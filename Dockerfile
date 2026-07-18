FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# Seed copy of the listings — restored into data/ on first boot (see src/seed.js).
# Kept outside data/ so a persistent-disk mount at /app/data can't shadow it.
COPY data/houses.json ./seed/houses.json

RUN mkdir -p data public/images/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
