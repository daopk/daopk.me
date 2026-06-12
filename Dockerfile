FROM node:24-alpine AS builder

WORKDIR /app

ARG DAOPK_BUILD_TIME=""
ARG DAOPK_PUBLIC_ASSET_BASE_URL=""

ENV DAOPK_BUILD_TIME="${DAOPK_BUILD_TIME}"
ENV DAOPK_PUBLIC_ASSET_BASE_URL="${DAOPK_PUBLIC_ASSET_BASE_URL}"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable pnpm

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm build

FROM nginx:1.29-alpine

ARG DAOPK_PUBLIC_ASSET_BASE_URL=""

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
RUN if [ -n "$DAOPK_PUBLIC_ASSET_BASE_URL" ]; then rm -rf /usr/share/nginx/html/assets; fi

EXPOSE 80
