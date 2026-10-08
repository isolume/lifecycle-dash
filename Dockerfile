FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
# Provide safe defaults so `next build` can run during image build.
ENV DATABASE_URL=postgres://hackathon:hackathon@postgres:5432/hackathon
ENV DATABASE_SSL=false
ENV DATABASE_POOL_MAX=10

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start"]
