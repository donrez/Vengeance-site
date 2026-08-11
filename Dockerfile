FROM node:20-alpine AS builder

WORKDIR /app

ARG MONGODB_URI
ENV MONGODB_URI=$MONGODB_URI

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --production --no-audit --no-fund

COPY --from=builder /app/.modelence ./.modelence

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", ".modelence/build/app.mjs"]
