FROM oven/bun:1.3.13

WORKDIR /app

COPY package.json ./
COPY src ./src

RUN bun install --production

EXPOSE 8080

CMD ["bun", "run", "start"]
