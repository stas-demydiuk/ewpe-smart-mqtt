FROM arm32v6/node:alpine

COPY qemu-arm-static /usr/bin

WORKDIR /opt/ewpe-smart-mqtt
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]