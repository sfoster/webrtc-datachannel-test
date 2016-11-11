'use strict';
var ursa = require('ursa');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

var key = ursa.generatePrivateKey(1024, 65537);
var privpem = key.toPrivatePem();
var pubpem = key.toPublicPem();
var privkey = path.join('server', 'privkey.pem');
var pubkey = path.join('server', 'pubkey.pem');

mkdirp('server');
fs.writeFileSync(privkey, privpem, 'ascii');
fs.writeFileSync(pubkey, pubpem, 'ascii');


var keyB = ursa.generatePrivateKey(1024, 65537);
var privpemB = keyB.toPrivatePem();
var pubpemB = keyB.toPublicPem();
var privkeyB = path.join('client', 'privkey.pem');
var pubkeyB = path.join('client', 'pubkey.pem');

mkdirp('client');
fs.writeFileSync(privkeyB, privpemB, 'ascii');
fs.writeFileSync(pubkeyB, pubpemB, 'ascii');
