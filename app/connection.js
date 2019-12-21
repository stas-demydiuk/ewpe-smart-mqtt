const crypto = require('crypto');
const dgram = require('dgram');
const logger = require('winston');
const EventEmitter = require('events');
const { encrypt, decrypt, defaultKey } = require('./encryptor');

const commandsMap = {
    'bind': 'bindok',
    'status': 'dat',
    'cmd': 'res'
}

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
        });

        this.socket.on('error', (error) => {
            logger.error(error.message);
        });

        this.socket.bind();
    }

    registerKey(deviceId, key) {
        this.devices[deviceId] = key;
    }

    getEncryptionKey(deviceId) {
        return this.devices[deviceId] || defaultKey;
    }

    scan(networks) {
        const message = Buffer.from(JSON.stringify({t: 'scan'}));

        this.socket.setBroadcast(true);

        networks.split(';').forEach((networkAddress) => {
            logger.debug(`Scanning network ${networkAddress} for available devices...`)
            this.socket.send(message, 0, message.length, 7000, networkAddress);
        })
    }

    async sendRequest(address, port, key, payload) {
        return new Promise((resolve, reject) => {
            const request = {
                cid: 'app',
                i: key === defaultKey ? 1 : 0,
                t: 'pack',
                uid: 0,
                pack: encrypt(payload, key)
            };

            const messageHandler = (msg, rinfo) => {
                const message = JSON.parse(msg.toString());
                let response;
                
                // Check device address data
                if (rinfo.address !== address || rinfo.port !== port) {
                    return;
                }

                logger.debug(`Received message from ${message.cid} (${rinfo.address}:${rinfo.port}) ${msg.toString()}`);

                try {
                    response = decrypt(message.pack, key);
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

                if (this.socket && this.socket.off) {
                    this.socket.off('message', messageHandler);
                }

                resolve(response);
            }
        
            logger.debug(`Sending request to ${address}:${port}: ${JSON.stringify(payload)}`);
        
            this.socket.on('message', messageHandler);
    
            const toSend = Buffer.from(JSON.stringify(request));
            this.socket.send(toSend, 0, toSend.length, port, address);
        });
    }

    handleResponse(msg, rinfo) {
        const message = JSON.parse(msg.toString());
        const key = this.getEncryptionKey(message.cid);
        const response = decrypt(message.pack, key);

        this.emit(response.t, response, rinfo);
    }
}

module.exports = Connection;