const MCrypt = require('mcrypt').MCrypt;

const defaultKey = 'a3K8Bx%2r8Y7#xDh';

function encrypt(data, key = defaultKey) {
	const desEcb = new MCrypt('rijndael-128', 'ecb');
	desEcb.open(key);
	console.log(JSON.stringify(data));
	const ciphertext = desEcb.encrypt(JSON.stringify(data));
	const request = ciphertext.toString('base64');
	return request;
}

function decrypt(data, key = defaultKey) {
	const aesEcb = MCrypt('rijndael-128', 'ecb')
	aesEcb.open(key);
	const ciphertext = new Buffer(data, 'base64');
	const plaintext = aesEcb.decrypt(ciphertext).toString();
	if (plaintext.includes("�")) {null} else {
        const response = plaintext.slice(0,plaintext.lastIndexOf('}'))+'}';
	result = JSON.parse(response.toString());
	result.cid = result.cid || result.mac;
	result.name = result.name || result.mac.substring(result.mac.length - 8);
	}
	return result
}

module.exports = {
    defaultKey,
    encrypt,
    decrypt
}
