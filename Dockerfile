FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
