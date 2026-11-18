const dgram = require('dgram');
const logger = require('winston');
const EventEmitter = require('events');
const { encrypt, decrypt, encryptGcm, decryptGcm, defaultKey, gcmDefaultKey } = require('./encryptor');

const commandsMap = {
    'bind': 'bindok',
    'status': 'dat',
    'cmd': 'res'
}

// How long to wait for a device to answer a request before giving up. Without
// this a device that never replies (e.g. a V2 device probed with the V1
// protocol) leaves the bind promise pending forever.
const REQUEST_TIMEOUT = 3000;
const SCAN_INTERVAL = Number(process.env.SCAN_INTERVAL || 60000);

class Connection extends EventEmitter {
    constructor(address) {
        super();
        this.socket = dgram.createSocket('udp4');
        this.devices = {};

        this.socket.on('message', this.handleResponse.bind(this));

        this.socket.on('listening', () => {
            const socketAddress = this.socket.address();
            logger.info(`Socket server is listening on ${socketAddress.address}:${socketAddress.port}`)

            this.scan(address);

            // Keep scanning so devices that were offline at startup are still found
            if (SCAN_INTERVAL > 0) {
                this.scanTimer = setInterval(() => this.scan(address, true), SCAN_INTERVAL);
            }
        });

        this.socket.on('error', (error) => {
            logger.error(error.message);
        });

        this.socket.bind();
    }

    close() {
        clearInterval(this.scanTimer);
        this.socket.close();
    }

    registerKey(deviceId, key, version = 1) {
        this.devices[deviceId] = { key, version };
    }

    getDevice(deviceId) {
        return this.devices[deviceId];
    }

    scan(networks, quiet = false) {
        const message = Buffer.from(JSON.stringify({t: 'scan'}));

        this.socket.setBroadcast(true);

        networks.split(';').forEach((networkAddress) => {
            logger.log(quiet ? 'debug' : 'info', `Scanning network ${networkAddress} for available devices...`)
            this.socket.send(message, 0, message.length, 7000, networkAddress);
        })
    }

    encryptRequest(payload, key, version) {
        if (version === 2) {
            const { pack, tag } = encryptGcm(payload, key);

            return {
                cid: 'app',
                i: key === gcmDefaultKey ? 1 : 0,
                t: 'pack',
                uid: 0,
                tcid: payload.mac,
                pack,
                tag
            };
        }

        return {
            cid: 'app',
            i: key === defaultKey ? 1 : 0,
            t: 'pack',
            uid: 0,
            pack: encrypt(payload, key)
        };
    }

    decryptResponse(message, key, version) {
        return version === 2 ? decryptGcm(message.pack, key, message.tag) : decrypt(message.pack, key);
    }

    async sendRequest(address, port, key, payload, version = 1) {
        return new Promise((resolve, reject) => {
            const request = this.encryptRequest(payload, key, version);

            let timeout;

            const cleanup = () => {
                clearTimeout(timeout);
                if (this.socket && this.socket.off) {
                    this.socket.off('message', messageHandler);
                }
            }

            const messageHandler = (msg, rinfo) => {
                let message, response;

                // Check device address data
                if (rinfo.address !== address || rinfo.port !== port) {
                    return;
                }

                try {
                    message = JSON.parse(msg.toString());
                } catch {
                    // Invalid JSON is already reported by handleResponse
                    return;
                }

                logger.debug(`Received message from ${message.cid} (${rinfo.address}:${rinfo.port}) ${msg.toString()}`);

                try {
                    response = this.decryptResponse(message, key, version);
                } catch (e) {
                    logger.error(`Can not decrypt message from ${message.cid} (${rinfo.address}:${rinfo.port}) with key ${key}`);
                    logger.debug(message.pack)
                    return;
                }

                if (response.t !== commandsMap[payload.t]) {
                    return;
                }

                if (response.mac !== payload.mac) {
                    return;
                }

                cleanup();
                resolve(response);
            }

            timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Request to ${address}:${port} (${payload.t}) timed out`));
            }, REQUEST_TIMEOUT);

            logger.debug(`Sending request to ${address}:${port}: ${JSON.stringify(payload)}`);

            this.socket.on('message', messageHandler);

            const toSend = Buffer.from(JSON.stringify(request));
            this.socket.send(toSend, 0, toSend.length, port, address);
        });
    }

    handleResponse(msg, rinfo) {
        let message, response;

        try {
            message = JSON.parse(msg.toString());
        } catch {
            logger.error(`Device ${rinfo.address}:${rinfo.port} sent invalid JSON that can not be parsed`)
            logger.debug(msg)
            return;
        }

        // A device may speak either the V1 (ECB) or V2 (GCM) protocol. Try a
        // registered key first, then both generic keys, so discovery works
        // regardless of firmware.
        const registered = this.devices[message.cid];
        const candidates = [];
        if (registered) {
            candidates.push(registered);
        }
        candidates.push({ key: defaultKey, version: 1 });
        candidates.push({ key: gcmDefaultKey, version: 2 });

        for (const { key, version } of candidates) {
            try {
                response = this.decryptResponse(message, key, version);
                break;
            } catch {
                // try the next candidate
            }
        }

        if (!response) {
            logger.error(`Can not decrypt message from ${message.cid} (${rinfo.address}:${rinfo.port})`);
            logger.debug(message.pack)
            return;
        }

        this.emit(response.t, response, rinfo);
    }
}

module.exports = Connection;
