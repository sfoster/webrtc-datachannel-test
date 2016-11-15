'use strict';
var Sound = require('node-aplay');
var tmp = require('tmp');
var fs = require('fs');
var path = require('path');
var ursa = require('ursa');
var DeviceConnection = require('./deviceconnection').DeviceConnection;
var FileSender = require('./filesender').FileSender;

var keydir = path.join(__dirname, '.keys');
var serverKeyId = 'signaling_server';

/** CONFIG **/
var deviceId = process.env.HAIKU_DEVICE_ID || 'node-client-a';
var configuration = {
  /** You should probably use a different stun server doing commercial stuff **/
  /** Also see: https://gist.github.com/zziuni/3741933 **/
  'iceServers': [
    {urls:"stun:stun.l.google.com:19305"},
    {urls:"stun:stun1.l.google.com:19305"},
    {urls:"stun:stun2.l.google.com:19305"},
    {urls:"stun:stun3.l.google.com:19305"}
  ],
  'signalingURLProtocol': 'ws:',
  'signalingURLHostname': (process.env.HAIKU_SIGNALING_HOSTNAME || '0.0.0.0'),
  'signalingURLPort': process.env.HAIKU_SIGNALING_PORT || '8080',
  'dataChannelLabel': 'dc',
}

var gDeviceConnection;

function connectAs(deviceId) {
  if (gDeviceConnection) {
    gDeviceConnection.disconnect();
  }

  console.log('Connecting as: ' + deviceId);
  var pubkeyServerFilename = path.join(keydir, serverKeyId + '.pub.pem');
  var privkeyClientFilename = path.join(keydir, deviceId + '.pem');
  console.log('privkeyClientFilename: ', privkeyClientFilename);
  var pubkeyServer;
  var privkeyClient;

  if (fs.existsSync(privkeyClientFilename)) {
    privkeyClient = ursa.createPrivateKey( fs.readFileSync(privkeyClientFilename) );
  } else {
    throw new Error('Private key for device "'+deviceId+'" not found');
  }

  if (fs.existsSync(pubkeyServerFilename)) {
    pubkeyServer = ursa.createPublicKey(fs.readFileSync(pubkeyServerFilename));
  } else {
    // TODO: just send rejection?
    throw new Error('Public key for server: "' +serverKeyId + '" not found');
  }

  var msg = 'secret msg';
  var encrypt = pubkeyServer.encrypt(msg, 'utf8', 'base64');
  var sign = privkeyClient.hashAndSign('sha256', msg, 'utf8', 'base64');

  configuration.signalingSocketOptions = {
    headers: {
      encrypted: encrypt,
      signed: sign,
      deviceid: deviceId
    }
  };

  gDeviceConnection = new DeviceConnection(deviceId, configuration);

  gDeviceConnection.on('datachannelopen', () => {
    gDeviceConnection.dataChannel.send('hello from: ' + gDeviceConnection.id);
    // TEST it works
    if (deviceId.includes('-a')) {
      var fileSender = new FileSender(gDeviceConnection.dataChannel);
      fileSender.send('./bird.wav', ' audio/x-wav');
    }
  });

  gDeviceConnection.on('filereceived', function(event) {
    console.log('filereceived, got event: ', event);
    playBufferAsAudio(event.data, event.contentType);
  });

  gDeviceConnection.connect();
}

function playBufferAsAudio(buf, contentType) {
  // create tmp file
  // write the buffer to it
  // pass that tmp file to an external player

  tmp.file(function (err, path, fd, cleanup) {
    if (err) throw err;

    fs.writeFile(path, buf, function(err) {
      if (err) throw err;
      console.log('attempting to play file at: ', path);
      // NOTE: this works for wav files, but an .mp3 is getting garbled and results in noise
      var sound = new Sound(path);
      sound.on('complete', () => {
        // manually cleanup the tmp file
        cleanup();
      });
      sound.play();
    });
  });
}

connectAs(deviceId);
