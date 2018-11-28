const crypto = require('crypto');

const defaultKey = 'a3K8Bx%2r8Y7#xDh';

function encrypt(data, key = defaultKey) {
    const cipher = crypto.createCipheriv('aes-128-ecb', key, '');
    const str = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    const request = str + cipher.final('base64');
    return request;
}

function decrypt(data, key = defaultKey) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, '');
    const str = decipher.update(data, 'base64', 'utf8');
    const response = JSON.parse(str + decipher.final('utf8'));

    return response;
}

module.exports = {
    defaultKey,
    encrypt,
    decrypt
}