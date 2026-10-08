FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts ./scripts
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4318 CONVERSA_DATA_DIR=/data
EXPOSE 4318
CMD ["node", "src/server.mjs"]
