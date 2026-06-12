FROM node:24-alpine AS builder

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable pnpm

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm build

FROM nginx:1.29-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
