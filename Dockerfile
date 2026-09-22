FROM ghcr.io/cloud-cli/image-node:latest

USER 0
COPY . .
RUN pnpm install --frozen-lockfile --prod
ENV NODE_ENV=production
ENV DATA_ROOT=/home/app/data
ENV NAVI_ROOT=/home/app/navi
EXPOSE 3000
VOLUME ["/home/app/data", "/home/app/navi"]
USER 1000
