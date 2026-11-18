// Disable periodic rescans; read by app/connection.js at load time
process.env.SCAN_INTERVAL = '0';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('events');
const logger = require('winston');
const DeviceManager = require('../app/device_manager');
const { FakeDevice, DEVICE_KEY } = require('./fake_device');

logger.configure({ silent: true, transports: [new logger.transports.Console()] });

// The bridge always talks to port 7000; these tests share it, so they run one at a time.
describe('DeviceManager', { concurrency: 1, timeout: 15000 }, () => {
    let device;
    let manager;

    const start = async (options) => {
        device = new FakeDevice(options);
        await device.start();
        manager = new DeviceManager('127.0.0.1');
    };

    // Long enough for a V2 timeout followed by a V1 bind, short enough to fail instead of hanging
    const waitForBind = async () => {
        const [deviceId, bound] = await once(manager, 'device_bound', { signal: AbortSignal.timeout(8000) });
        return { deviceId, bound };
    };

    afterEach(async () => {
        manager?.close();
        await device?.stop();
        manager = device = undefined;
    });

    describe('V2 device', () => {
        beforeEach(() => start({ protocol: 2, name: 'v2-unit' }));

        it('binds over V2 with a GCM envelope', async () => {
            const { deviceId, bound } = await waitForBind();

            assert.equal(deviceId, 'aabbccddeeff');
            assert.equal(bound.version, 2);
            assert.equal(bound.key, DEVICE_KEY);
            assert.equal(bound.name, 'v2-unit');

            const bindRequest = device.requests.find((r) => r.t === 'pack');
            assert.equal(bindRequest.i, 1);
            assert.equal(bindRequest.tcid, 'aabbccddeeff');
            assert.ok(bindRequest.tag);
        });

        it('reads status with the device key', async () => {
            const { deviceId } = await waitForBind();
            const status = await manager.getDeviceStatus(deviceId);

            assert.equal(status.Pow, 0);
            assert.equal(status.SetTem, 24);
            assert.equal(status.TemSen, 24); // 64 + TEMPERATURE_SENSOR_OFFSET

            const statusRequest = device.requests.at(-1);
            assert.equal(statusRequest.i, 0);
            assert.ok(statusRequest.tag);
        });

        it('sends commands', async () => {
            const { deviceId } = await waitForBind();
            const result = await manager.setDeviceState(deviceId, { Pow: 1, SetTem: 22 });

            assert.deepEqual(result, { Pow: 1, SetTem: 22 });
            assert.equal(device.state.Pow, 1);
            assert.equal(device.state.SetTem, 22);
        });

        it('does not bind the same device twice on rescan', async () => {
            await waitForBind();
            const requestsBefore = device.requests.length;

            manager.connection.scan('127.0.0.1', true);
            await new Promise((resolve) => setTimeout(resolve, 200));

            assert.equal(manager.getDevices().length, 1);
            // only the scan itself, no new bind request
            assert.deepEqual(device.requests.slice(requestsBefore).map((r) => r.t), ['scan']);
        });

        it('follows a device that moved to a new address', async () => {
            const { deviceId } = await waitForBind();

            await manager._registerDevice({ t: 'dev', cid: deviceId, mac: deviceId }, { address: '127.0.0.2', port: 7001 });

            const [moved] = manager.getDevices();
            assert.equal(moved.address, '127.0.0.2');
            assert.equal(moved.port, 7001);
        });
    });

    describe('V2 device without auth tag', () => {
        beforeEach(() => start({ protocol: 2, sendTag: false }));

        it('still binds and reads status', async () => {
            const { deviceId, bound } = await waitForBind();
            assert.equal(bound.version, 2);

            const status = await manager.getDeviceStatus(deviceId);
            assert.equal(status.SetTem, 24);
        });
    });

    describe('V1 device', () => {
        beforeEach(() => start({ protocol: 1, name: 'v1-unit' }));

        it('falls back to V1 after the V2 bind times out', async () => {
            const { bound } = await waitForBind();

            assert.equal(bound.version, 1);
            assert.equal(bound.key, DEVICE_KEY);

            const [v2Attempt, v1Attempt] = device.requests.filter((r) => r.t === 'pack');
            assert.ok(v2Attempt.tag);
            assert.equal(v1Attempt.tag, undefined);
            assert.equal(v1Attempt.tcid, undefined);
        });

        it('reads status and sends commands over V1', async () => {
            const { deviceId } = await waitForBind();

            const status = await manager.getDeviceStatus(deviceId);
            assert.equal(status.TemSen, 24);

            const result = await manager.setDeviceState(deviceId, { Pow: 1 });
            assert.deepEqual(result, { Pow: 1 });

            assert.equal(device.requests.at(-1).tag, undefined);
        });
    });

    describe('unresponsive device', () => {
        beforeEach(() => start({ protocol: 2, answerBind: false }));

        it('gives up binding without crashing and releases the binding lock', async () => {
            // V2 attempt + V1 fallback, 3 s timeout each
            await new Promise((resolve) => setTimeout(resolve, 6500));

            assert.equal(manager.getDevices().length, 0);
            assert.deepEqual(manager.binding, {});
        });

        it('rejects status requests for unknown devices', async () => {
            await assert.rejects(manager.getDeviceStatus('000000000000'), /not found/);
        });
    });
});
