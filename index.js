require('dotenv').config({ quiet: true });
const mqtt = require('mqtt');
const logger = require('winston');
const DeviceManager = require('./app/device_manager');

const networkAddress = process.env.NETWORK || '192.168.1.255';
const mqttServerAddress = process.env.MQTT_SERVER || 'mqtt://127.0.0.1';
const mqttBaseTopic = process.env.MQTT_BASE_TOPIC || 'ewpe-smart';
const pollInterval = process.env.DEVICE_POLL_INTERVAL || 5000;
const mqttServerUsername = process.env.MQTT_USERNAME || '';
const mqttServerpassword = process.env.MQTT_PASSWORD || '';
const mqttServerport = process.env.MQTT_PORT || 1883;


const customLogFormat = logger.format.printf(info => {
    const message = JSON.stringify(info.message).replace(/["\\]/g, '')
    return `${info.timestamp} [${info.level}]: ${message}`;
})

logger.configure({
    level: process.env.LOG_LEVEL || 'info',
    format: logger.format.combine(
        logger.format.timestamp(),
        logger.format.colorize(),
        logger.format.json(),
        customLogFormat
    ),
    transports: [
        new logger.transports.Console()
    ]
});

const bridgeStateTopic = `${mqttBaseTopic}/bridge/state`;
const deviceRegex = new RegExp(`^${mqttBaseTopic}\/([0-9a-h]{12})\/(.*)$`, 'i');

logger.info(`Trying to connect to MQTT server ${mqttServerAddress} ...`)
const mqttClient = mqtt.connect(mqttServerAddress, {
    username: mqttServerUsername,
    password: mqttServerpassword,
    port: mqttServerport,
    // Let the broker announce the bridge as offline if the connection drops
    will: { topic: bridgeStateTopic, payload: 'offline' }
});

// Created once on the first connection and kept across MQTT reconnects, so a
// broker or network restart doesn't spawn duplicate sockets, pollers and listeners
let deviceManager;

const getDeviceStatus = async (deviceId) => {
    try {
        const deviceStatus = await deviceManager.getDeviceStatus(deviceId);
        mqttClient.publish(`${mqttBaseTopic}/${deviceId}/status`, JSON.stringify(deviceStatus));
    } catch (e) {
        // A single unreachable device must not take down the whole bridge
        logger.warn(`Status request for ${deviceId} failed: ${e.message}`);
    }
}

const startDeviceManager = () => {
    deviceManager = new DeviceManager(networkAddress);

    deviceManager.on('device_bound', (deviceId, device) => {
        mqttClient.publish(`${mqttBaseTopic}/${deviceId}`, JSON.stringify(device));

        if (pollInterval > 0) {
            setInterval(() => {
                // Don't poll (and queue status messages) while the broker is unreachable
                if (mqttClient.connected) {
                    getDeviceStatus(deviceId);
                }
            }, pollInterval);
        }
    });
}

mqttClient.on('connect', () => {
    logger.info('Successfully connected to MQTT server');

    if (!deviceManager) {
        startDeviceManager();
    }

    mqttClient.publish(bridgeStateTopic, 'online');
    mqttClient.subscribe(`${mqttBaseTopic}/#`);
});

mqttClient.on('message', async (topic, message) => {
    let matches;

    logger.info(`MQTT message received: ${topic} ${message}`);

    if (!deviceManager) {
        return;
    }

    if (topic === `${mqttBaseTopic}/devices/list`) {
        mqttClient.publish(`${mqttBaseTopic}/devices`, JSON.stringify(deviceManager.getDevices()))
    } else {
        matches = deviceRegex.exec(topic);

        if (matches !== null) {
            const [, deviceId, command] = matches;

            if (command === 'get') {
                getDeviceStatus(deviceId);
            }

            if (command === 'set') {
                try {
                    const cmdResult = await deviceManager.setDeviceState(deviceId, JSON.parse(message));
                    mqttClient.publish(`${mqttBaseTopic}/${deviceId}/status`, JSON.stringify(cmdResult));
                } catch (e) {
                    logger.warn(`Set request for ${deviceId} failed: ${e.message}`);
                }
            }
        }
    }
});

mqttClient.on('error', (error) => {
    logger.error(error);
});

let shuttingDown = false;

const shutdown = (signal) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    logger.info(`Received ${signal}, shutting down...`);
    deviceManager?.close();

    // Don't hang on shutdown if the broker is unreachable
    setTimeout(() => process.exit(0), 2000).unref();

    if (mqttClient.connected) {
        mqttClient.publish(bridgeStateTopic, 'offline', () => mqttClient.end(false, () => process.exit(0)));
    } else {
        mqttClient.end(true, () => process.exit(0));
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
