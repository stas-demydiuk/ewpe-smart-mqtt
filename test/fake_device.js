const dgram = require('dgram');
const { encrypt, decrypt, encryptGcm, decryptGcm, defaultKey, gcmDefaultKey } = require('../app/encryptor');

const DEVICE_KEY = 'abcdefghijklmnop';

/**
 * Minimal UDP simulator of an EWPE/Gree air conditioner.
 *
 * Both firmware generations answer the discovery scan over V1 (AES-ECB).
 * - protocol 1: binding, status and commands over V1 (AES-ECB)
 * - protocol 2: binding, status and commands over V2 (AES-GCM); V1 requests are ignored
 * - answerBind: false simulates a unit that is discovered but never binds
 */
class FakeDevice {
    constructor({ mac = 'aabbccddeeff', name = 'fake', protocol = 1, answerBind = true, sendTag = true } = {}) {
        this.mac = mac;
        this.name = name;
        this.protocol = protocol;
        this.answerBind = answerBind;
        this.sendTag = sendTag;
        this.requests = [];
        this.state = { Pow: 0, Mod: 1, SetTem: 24, TemSen: 64 };
        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', this._onMessage.bind(this));
    }

    start(port = 7000, address = '127.0.0.1') {
        return new Promise((resolve) => this.socket.bind(port, address, resolve));
    }

    stop() {
        return new Promise((resolve) => this.socket.close(resolve));
    }

    _send(obj, rinfo) {
        const buffer = Buffer.from(JSON.stringify(obj));
        this.socket.send(buffer, 0, buffer.length, rinfo.port, rinfo.address);
    }

    _onMessage(msg, rinfo) {
        const request = JSON.parse(msg.toString());
        this.requests.push(request);

        if (request.t === 'scan') {
            const pack = encrypt({ t: 'dev', cid: this.mac, mac: this.mac, name: this.name });
            return this._send({ t: 'pack', i: 1, uid: 0, cid: this.mac, tcid: '', pack }, rinfo);
        }

        const isV2 = 'tag' in request;
        if ((this.protocol === 2) !== isV2) {
            return; // request in a protocol this firmware doesn't speak
        }

        const key = request.i === 1 ? (isV2 ? gcmDefaultKey : defaultKey) : DEVICE_KEY;
        const payload = isV2 ? decryptGcm(request.pack, key, request.tag) : decrypt(request.pack, key);
        const response = this._handle(payload);

        if (!response) {
            return;
        }

        if (isV2) {
            const { pack, tag } = encryptGcm(response, key);
            this._send({ t: 'pack', i: request.i, uid: 0, cid: this.mac, tcid: '', pack, ...(this.sendTag ? { tag } : {}) }, rinfo);
        } else {
            this._send({ t: 'pack', i: request.i, uid: 0, cid: this.mac, tcid: '', pack: encrypt(response, key) }, rinfo);
        }
    }

    _handle(payload) {
        switch (payload.t) {
            case 'bind':
                return this.answerBind ? { t: 'bindok', mac: this.mac, key: DEVICE_KEY, r: 200 } : null;
            case 'status':
                return { t: 'dat', mac: this.mac, r: 200, cols: payload.cols, dat: payload.cols.map((col) => this.state[col] ?? 0) };
            case 'cmd':
                payload.opt.forEach((opt, i) => { this.state[opt] = payload.p[i]; });
                return { t: 'res', mac: this.mac, r: 200, opt: payload.opt, p: payload.p, val: payload.p };
        }
    }
}

module.exports = { FakeDevice, DEVICE_KEY };
