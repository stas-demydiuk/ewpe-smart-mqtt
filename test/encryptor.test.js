const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, encryptGcm, decryptGcm, defaultKey, gcmDefaultKey } = require('../app/encryptor');

const payload = { t: 'bind', mac: 'aabbccddeeff', uid: 0 };
const otherKey = 'abcdefghijklmnop';

describe('V1 (AES-128-ECB)', () => {
    it('round-trips with the generic key', () => {
        assert.deepEqual(decrypt(encrypt(payload)), payload);
    });

    it('round-trips with a device key', () => {
        assert.deepEqual(decrypt(encrypt(payload, otherKey), otherKey), payload);
    });

    it('matches the known wire format for the generic key', () => {
        // AES-ECB is deterministic, so a fixed vector pins the wire format
        assert.equal(encrypt({ t: 'scan' }, defaultKey), 'VT6PQOWv+8FeevjTXFZdyQ==');
    });

    it('fails to decrypt with the wrong key', () => {
        assert.throws(() => decrypt(encrypt(payload), otherKey));
    });
});

describe('V2 (AES-128-GCM)', () => {
    it('returns base64 pack and 16-byte tag', () => {
        const { pack, tag } = encryptGcm(payload);
        assert.match(pack, /^[A-Za-z0-9+/]+=*$/);
        assert.equal(Buffer.from(tag, 'base64').length, 16);
    });

    it('matches the known wire format for the generic key', () => {
        // The protocol uses a fixed nonce and AAD, so output is deterministic
        assert.deepEqual(encryptGcm({ t: 'scan' }, gcmDefaultKey), {
            pack: 'JtoKliwtupOy6N7K',
            tag: '4MYECKkr8e1oNZU2kblzAw=='
        });
    });

    it('round-trips with the generic key and verifies the tag', () => {
        const { pack, tag } = encryptGcm(payload, gcmDefaultKey);
        assert.deepEqual(decryptGcm(pack, gcmDefaultKey, tag), payload);
    });

    it('round-trips with a device key', () => {
        const { pack, tag } = encryptGcm(payload, otherKey);
        assert.deepEqual(decryptGcm(pack, otherKey, tag), payload);
    });

    it('rejects a tampered tag', () => {
        const { pack } = encryptGcm(payload);
        const badTag = Buffer.alloc(16).toString('base64');
        assert.throws(() => decryptGcm(pack, gcmDefaultKey, badTag));
    });

    it('rejects the wrong key when a tag is present', () => {
        const { pack, tag } = encryptGcm(payload, gcmDefaultKey);
        assert.throws(() => decryptGcm(pack, otherKey, tag));
    });

    it('decrypts messages without a tag', () => {
        const { pack } = encryptGcm(payload);
        assert.deepEqual(decryptGcm(pack), payload);
    });

    it('does not decrypt a V1 message', () => {
        assert.throws(() => decryptGcm(encrypt(payload), gcmDefaultKey));
    });
});
