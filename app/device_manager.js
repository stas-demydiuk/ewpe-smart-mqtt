const logger = require('winston');
const EventEmitter = require('events');
const Connection = require('./connection');
const { defaultKey, gcmDefaultKey } = require('./encryptor');
const TEMPERATURE_SENSOR_OFFSET = -40;

// https://github.com/tomikaa87/gree-remote
const statusKeys = [
    'Pow', 'Mod', 'TemUn', 'SetTem', 'TemRec', 'WdSpd', 'Air',
    'Blo', 'Health', 'SwhSlp', 'Lig', 'SwingLfRig', 'SwUpDn',
    'Quiet', 'Tur', 'SvSt', 'TemSen'
]

class DeviceManager extends EventEmitter {
    constructor(networkAddress) {
        super();
        this.connection = new Connection(networkAddress);
        this.devices = {};
        this.binding = {};

        this.connection.on('dev', this._registerDevice.bind(this));
    }

    close() {
        this.connection.close();
    }

    async _bind(address, port, deviceId) {
        const payload = { mac: deviceId, t: 'bind', uid: 0 };

        // Newer EWPE/Gree firmware speaks the V2 (AES-GCM) protocol and simply
        // ignores V1 (AES-ECB) bind requests. Try V2 first, then fall back to
        // V1 for older units.
        try {
            const { key } = await this.connection.sendRequest(address, port, gcmDefaultKey, payload, 2);
            return { key, version: 2 };
        } catch (e) {
            logger.debug(`V2 bind failed for ${deviceId} (${e.message}), trying V1...`);
            const { key } = await this.connection.sendRequest(address, port, defaultKey, payload, 1);
            return { key, version: 1 };
        }
    }

    async _registerDevice(message, rinfo) {
        const deviceId = message.cid || message.mac;

        // Devices answer the scan more than once; don't bind the same one twice.
        if (this.devices[deviceId]) {
            // Follow the device if its IP changed (e.g. new DHCP lease)
            const device = this.devices[deviceId];
            if (device.address !== rinfo.address || device.port !== rinfo.port) {
                logger.info(`Device ${deviceId} moved to ${rinfo.address}:${rinfo.port}`);
                device.address = rinfo.address;
                device.port = rinfo.port;
            }
            return;
        }
        if (this.binding[deviceId]) {
            return;
        }
        this.binding[deviceId] = true;

        logger.info(`New device found: ${message.name} (mac: ${deviceId}), binding...`)
        const { address, port } = rinfo;

        let key, version;
        try {
            ({ key, version } = await this._bind(address, port, deviceId));
        } catch (e) {
            delete this.binding[deviceId];
            logger.error(`Can not bind device ${deviceId}: ${e.message}`);
            return;
        }

        const device = {
            ...message,
            mac: deviceId,
            address,
            port,
            key,
            version,
            t: undefined
        };

        this.devices[deviceId] = device;
        delete this.binding[deviceId];

        this.connection.registerKey(deviceId, key, version);

        this.emit('device_bound', deviceId, device);
        logger.info(`New device bound (v${version}): ${device.name} (${device.address}:${device.port})`);

        return device;
    }

    getDevices() {
        return Object.values(this.devices);
    }

    async getDeviceStatus(deviceId) {
        const device = this.devices[deviceId];

        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        const payload = {
            cols: statusKeys,
            mac: device.mac,
            t: 'status'
        };

        const response = await this.connection.sendRequest(device.address, device.port, device.key, payload, device.version);
        const deviceStatus = response.cols.reduce((acc, key, index) => ({
            ...acc,
            [key]: response.dat[index]
        }), {});

        if('TemSen' in deviceStatus){
        	deviceStatus['TemSen'] +=TEMPERATURE_SENSOR_OFFSET;
        }

        this.emit('device_status', deviceId, deviceStatus);
        return deviceStatus;
    }

    async setDeviceState(deviceId, state) {
        const device = this.devices[deviceId];

        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        const payload = {
            mac: device.mac,
            opt: Object.keys(state),
            p: Object.values(state),
            t: 'cmd'
        };

        const response = await this.connection.sendRequest(device.address, device.port, device.key, payload, device.version);
        const deviceStatus = response.opt.reduce((acc, key, index) => ({
            ...acc,
            [key]: response.val[index]
        }), {});

        this.emit('device_status', deviceId, deviceStatus);
        return deviceStatus;
    }
}

module.exports = DeviceManager
