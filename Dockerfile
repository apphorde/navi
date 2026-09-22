FROM ghcr.io/cloud-cli/image-node:latest

WORKDIR /tmp
COPY package.json pnpm-lock.yaml ./
RUN mkdir navi-build && cp package.json pnpm-lock.yaml navi-build/
WORKDIR /tmp/navi-build
RUN corepack install -g pnpm@10.15.0 && corepack pnpm install --frozen-lockfile --prod
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DATA_ROOT=/home/app/data
ENV NAVI_ROOT=/home/app/navi
EXPOSE 3000
VOLUME ["/home/app/data", "/home/app/navi"]
CMD ["node", "src/server.js"]
