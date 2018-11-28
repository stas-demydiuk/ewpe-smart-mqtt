const logger = require('winston');
const EventEmitter = require('events');
const Connection = require('./connection');
const { defaultKey } = require('./encryptor');

// https://github.com/tomikaa87/gree-remote
const statusKeys = [
    'Pow', 'Mod', 'TemUn', 'SetTem', 'TemRec', 'WdSpd', 'Air',
    'Blo', 'Health', 'SwhSlp', 'Lig', 'SwingLfRig', 'SwUpDn',
    'Quiet', 'Tur', 'SvSt'
]

class DeviceManager extends EventEmitter {
    constructor(networkAddress) {
        super();
        this.connection = new Connection(networkAddress);
        this.devices = {};

        this.connection.on('dev', this._registerDevice.bind(this));
    }

    async _registerDevice(message, rinfo) {
        const deviceId = message.cid;
        logger.info(`New device found: ${message.name} (${deviceId}), binding...`)
        const { address, port } = rinfo;

        const { key } = await this.connection.sendRequest(address, port, defaultKey, {
            mac: deviceId,
            t: 'bind',
            uid: 0
        });

        const device = {
            ...message,
            address,
            port,
            key,
            t: undefined
        };

        this.devices[deviceId] = device;

        this.connection.registerKey(deviceId, key);

        this.emit('device_bound', deviceId, device);
        logger.info(`New device bound: ${device.name} (${device.address}:${device.port})`);

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

        const response = await this.connection.sendRequest(device.address, device.port, device.key, payload);
        const deviceStatus = response.cols.reduce((acc, key, index) => ({
            ...acc,
            [key]: response.dat[index]
        }), {});

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

        const response = await this.connection.sendRequest(device.address, device.port, device.key, payload);
        const deviceStatus = response.opt.reduce((acc, key, index) => ({
            ...acc,
            [key]: response.val[index]
        }), {});

        this.emit('device_status', deviceId, deviceStatus);
        return deviceStatus;
    }
}

module.exports = DeviceManager