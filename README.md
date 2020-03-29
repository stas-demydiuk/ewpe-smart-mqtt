# ewpe-smart-mqtt
MQTT bridge for EWPE Smart powered devices which can be controled via WiFi using [EWPE Smart app](https://play.google.com/store/apps/details?id=com.gree.ewpesmart)

This project became possible thanks to great work of reverse engineering the original app protocol in [gree-remote](https://github.com/tomikaa87/gree-remote) project

![smart-1-600x600](https://user-images.githubusercontent.com/2734836/49315058-11f16e00-f4f5-11e8-84f5-81dc9cd813f0.jpg)

## Prerequisites

Setup and run MQTT server ([mosquitto](https://mosquitto.org/) is the easiest one)

## Installation

1. Clone or download this repository
```
git clone https://github.com/stas-demydiuk/ewpe-smart-mqtt
```
2. Install dependencies
```
npm install
```
3. Make initial configuration by setting enviromental variables

| Variable | Description | Default value |
| --- | --- | --- |
| MQTT_SERVER |MQTT server URI|mqtt://127.0.0.1|
| MQTT_BASE_TOPIC |Base MQTT topic for bridge messages|ewpe-smart
| NETWORK |Network adress (or addresses separated by semicolon) to scan devices |192.168.1.255
| DEVICE_POLL_INTERVAL |Interval (ms) to poll device status|5000

4. Run the bridge
```
npm start
```

## Installation (Docker)

```
docker run -it \
    --network="host" \
    -e "MQTT_SERVER=mqtt://127.0.0.1" \
    -e "MQTT_BASE_TOPIC=ewpe-smart" \
    -e "NETWORK=192.168.1.255" \
    -e "DEVICE_POLL_INTERVAL=5000" \
    --name ewpe-smart-mqtt \
    demydiuk/ewpe-smart-mqtt:latest
```

## Communicating with the bridge

- Publish to `ewpe-smart/devices/list` to receive list of registered devices
- Publish to `ewpe-smart/{deviceId}/get` to receive status of {deviceId}
- Publish to `ewpe-smart/{deviceId}/set` to set status of {deviceId}, payload should be json object with key/values pairs to set, i.e:
```
ewpe-smart/{deviceId}/set {"Pow": 1, "SetTem": 24}
```

## Supported devices
All devices which can be controlled via EWPE Smart app should be supported, including:

- Gree Smart series
- Cooper&Hunter: Supreme, Vip Inverter, ICY II, Arctic, Alpha, Alpha NG, Veritas, Veritas NG series
- EcoAir X series

