FROM node:18-alpine

WORKDIR /opt/ewpe-smart-mqtt
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "start"]