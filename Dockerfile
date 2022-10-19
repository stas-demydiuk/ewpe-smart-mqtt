FROM node:10

WORKDIR /opt/ewpe-smart-mqtt
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npm", "start"]
