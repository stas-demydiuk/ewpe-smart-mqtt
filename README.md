# proklima-to-mqtt
MQTT bridge for EWPE Smart powered devices like ProKlima from Bauhaus which can be controled via WiFi using [EWPE Smart app](https://play.google.com/store/apps/details?id=com.gree.ewpesmart)

This project became possible thanks to great work of reverse engineering the original app protocol in [gree-remote](https://github.com/tomikaa87/gree-remote) project

## Installation

1. Install dependencies
```
npm install
```
2. Make initial configuration by setting enviromental variables

| Variable | Description | Default value |
| --- | --- | --- |
| MQTT_SERVER |MQTT server URI|mqtt://127.0.0.1|
| MQTT_BASE_TOPIC |Base MQTT topic for bridge messages|ewpe-smart
| MQTT_USERNAME |MQTT Server Login Username|''
| MQTT_PASSWORD |MQTT Server Login Password|''
| MQTT_PORT |MQTT Server Port|'';
| NETWORK |Network adress (or addresses separated by semicolon) to scan devices |192.168.1.255
| DEVICE_POLL_INTERVAL |Interval (ms) to poll device status|5000

3. Run the bridge
```
npm start
```

## Installation (Docker)

```
docker run -it \
    --network="host" \
    -e "MQTT_SERVER=mqtt://127.0.0.1" \
    -e "MQTT_BASE_TOPIC=ewpe-smart" \
    -e "MQTT_USERNAME=root" \
    -e "MQTT_PASSWORD=tor" \
    -e "MQTT_PORT=1888" \
    -e "NETWORK=192.168.1.255" \
    -e "DEVICE_POLL_INTERVAL=5000" \
    --name ewpe-smart-mqtt \
    kartoffeltoby/proklima-to-mqtt:latest
```

## Communicating with the bridge

- Publish to `ewpe-smart/devices/list` to receive list of registered devices
- Publish to `ewpe-smart/{deviceId}/get` to receive status of {deviceId}
- Publish to `ewpe-smart/{deviceId}/set` to set status of {deviceId}, payload should be json object with key/values pairs to set, i.e:
```
ewpe-smart/{deviceId}/set {"Pow": 1, "SetTem": 24}
```
* `Pow`: power state of the device
  * 0: off
  * 1: on
  
* `Mod`: mode of operation
  * 0: auto
  * 1: cool
  * 2: dry
  * 3: fan
  * 4: heat  
  
* "SetTem" and "TemUn": set temperature and temperature unit
  * if `TemUn` = 0, `SetTem` is the set temperature in Celsius
  * if `TemUn` = 1, `SetTem` is the set temperature is Fahrenheit
  
* `WdSpd`: fan speed
  * 0: auto
  * 1: low
  * 2: medium-low (not available on 3-speed units)
  * 3: medium
  * 4: medium-high (not available on 3-speed units)
  * 5: high

* `Air`: controls the state of the fresh air valve (not available on all units)
  * 0: off
  * 1: on

* `Blo`: "Blow" or "X-Fan", this function keeps the fan running for a while after shutting down. Only usable in Dry and Cool mode

* `Health`: controls Health ("Cold plasma") mode, only for devices equipped with "anion generator", which absorbs dust and kills bacteria
  * 0: off
  * 1: on
  
* `SwhSlp`: sleep mode, which gradually changes the temperature in Cool, Heat and Dry mode
  * 0: off
  * 1: on

* `Lig`: turns all indicators and the display on the unit on or off
  * 0: off
  * 1: on

* `SwingLfRig`: controls the swing mode of the horizontal air blades (available on limited number of devices, e.g. some Cooper & Hunter units - thanks to [mvmn](https://github.com/mvmn))
  * 0: default
  * 1: full swing
  * 2-6: fixed position from leftmost to rightmost
  * Full swing, like for SwUpDn is not supported

* `SwUpDn`: controls the swing mode of the vertical air blades
  * 0: default
  * 1: swing in full range
  * 2: fixed in the upmost position (1/5)
  * 3: fixed in the middle-up position (2/5)
  * 4: fixed in the middle position (3/5)
  * 5: fixed in the middle-low position (4/5)
  * 6: fixed in the lowest position (5/5)
  * 7: swing in the downmost region (5/5)
  * 8: swing in the middle-low region (4/5)
  * 9: swing in the middle region (3/5)
  * 10: swing in the middle-up region (2/5)
  * 11: swing in the upmost region (1/5)

* `Quiet`: controls the Quiet mode which slows down the fan to its most quiet speed. Not available in Dry and Fan mode.
  * 0: off
  * 1: on
  
* `Tur`: sets fan speed to the maximum. Fan speed cannot be changed while active and only available in Dry and Cool mode.
  * 0: off
  * 1: on

* `StHt`: maintain the room temperature steadily at 8°C and prevent the room from freezing by heating operation when nobody is at home for long in severe winter (from http://www.gree.ca/en/features)

* `HeatCoolType`: unknown

* `TemRec`: this bit is used to distinguish between two Fahrenheit values (see Setting the temperature using Fahrenheit section below)

* `SvSt`: energy saving mode
  * 0: off
  * 1: on


## Supported devices
All devices which can be controlled via EWPE Smart app should be supported, including:

- Gree Smart series
- Cooper&Hunter: Supreme, Vip Inverter, ICY II, Arctic, Alpha, Alpha NG, Veritas, Veritas NG series
- EcoAir X series
- ProKlima
