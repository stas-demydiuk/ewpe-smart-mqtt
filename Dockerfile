FROM node:alpine

WORKDIR /opt/ewpe-smart-mqtt
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]