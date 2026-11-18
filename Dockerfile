FROM node:22-alpine

WORKDIR /opt/ewpe-smart-mqtt
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]