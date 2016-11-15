const readline = require('readline');
var Path = require('path');
var fs = require('fs');
var tmp = require('tmp');
var ursa = require('ursa');
var Sound = require('node-aplay');
var Recorder = require('./recorder').Recorder;
var DeviceConnection = require('./deviceconnection').DeviceConnection;
var FileSender = require('./filesender').FileSender;

var emojiLookup = require('./emoticon2emoji.js');
var state = 'notconnected'; // 'notconnected', 'startrecording', 'recording', 'sending', ''

var keydir = Path.join(__dirname, '.keys');
var serverKeyId = 'signaling_server';

/** CONFIG **/
var deviceId = process.env.HAIKU_DEVICE_ID || 'cli-client-a';
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
var gReceivedMessages = [];

function connectAs(deviceId) {
  if (gDeviceConnection) {
    gDeviceConnection.disconnect();
  }

  console.log('Connecting as: ' + deviceId);
  var pubkeyServerFilename = Path.join(keydir, serverKeyId + '.pub.pem');
  var privkeyClientFilename = Path.join(keydir, deviceId + '.pem');
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

  return new Promise((res, rej) => {
    gDeviceConnection.on('datachannelopen', () => {
      console.log('datachannel now open');
      // gDeviceConnection.dataChannel.send('hello from: ' + gDeviceConnection.id);
      // // TEST it works
      // if (deviceId.includes('-a')) {
      //   var fileSender = new FileSender(gDeviceConnection.dataChannel);
      //   fileSender.send('./bird.wav', ' audio/x-wav');
      // }
      res(true);
    });

    gDeviceConnection.on('filereceived', function(event) {
      gReceivedMessages.push({
        type: 'voice',
        contentType: event.contentType,
        data: event.data
      });

      console.log('filereceived, got event: ', event);
      console.log('Voice message received, do you want to play it?')
      state = 'playmessagequestion';
      rl.prompt();
    });

    gDeviceConnection.on('messagereceived', function(event) {
      gReceivedMessages.push(event);

      console.log('messagereceived, got event: ', event);
      console.log('Emoji message received, do you want to play it?')
      state = 'playmessagequestion';
      rl.prompt();
    });

    gDeviceConnection.connect();
  });
}

function handleCommand(line) {
  var cmd;
  var args;
  if (!line.includes(':')) {
    console.log(`you said: ${line}, commands take the form command: something`);
    return Promise.resolve(true);
  }
  cmd = line.substring(0, line.indexOf(':')).trim();
  args = line.substring(line.indexOf(':')+1).trim();
  switch (cmd) {
    case 'say':
      args.trim().split(/\s+/).forEach(str => {
        var emoji = emojiLookup.get(str);
        gDeviceConnection.dataChannel.send(emoji);
        console.log('message sent: ' + emoji);
      });
      break;
    case 'record':
      state = 'startrecording';
      rl.write('press ENTER to start recording, and ENTER again to stop');
      return Promise.resolve(false);
      break;
    default:
      console.log(`command {$cmd} not implemented`);
  }
  return Promise.resolve(true);
}

var noop = () => {};
var recordingTimeout;
var currentRecorder;
var recordingProgress = {
  stop: noop,
  timeout: null
};

function reportError(err) {
  console.warn(err);
}

function recordAudio() {
  console.log('Recording for max 15s. Press ENTER to finish');
  return new Promise((res, rej) => {
    var recorder = currentRecorder = new Recorder();
    var captureFilename = 'voice.wav';
    recorder.on('recording', (details) => {
      console.log('recording to: ' + details.filename);
    });

    console.log('currentRecorder: ', !!currentRecorder);
    recorder.captureAudio({ filename: captureFilename, duration: 2 }).then((details) => {
      // console.log('message sent sounds like this: ');
      // var sound = new Sound(details.filename);
      // sound.on('complete', () => {
      //   res(true);
      // });
      // sound.play();
      res(captureFilename);
    }).catch(reportError);
  });
}

function playBufferAsAudio(buf, contentType) {
  // create tmp file
  // write the buffer to it
  // pass that tmp file to an external player
  return new Promise((res, rej) => {
    tmp.file(function (err, path, fd, cleanup) {
      if (err) return rej(err);

      fs.writeFile(path, buf, function(err) {
        if (err) return rej(err);
        console.log('attempting to play file at: ', path);
        // NOTE: this works for wav files, but an .mp3 is getting garbled and results in noise
        var sound = new Sound(path);
        sound.on('complete', () => {
          // manually cleanup the tmp file
          cleanup();
          res(true);
        });
        sound.play();
      });
    });
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  prompt: '> '
});

rl.prompt();

rl.on('line', (line) => {
  switch (state) {
    case 'notconnected':
      if (line.trim() === 'connect:') {
        connectAs(deviceId).then(() => {
          state = '';
          console.log('connected, try "say:" or "record:"')
          rl.prompt();
        });
      } else {
        console.log('not connected, try connect:');
        rl.prompt();
      }
      break;
    case 'sending':
      break;
    case 'startrecording':
      state = 'recording';
      recordAudio().then(filename => {
        var fileSender = new FileSender(gDeviceConnection.dataChannel);
        fileSender.send(filename, ' audio/x-wav');

        console.log('recorded and sent');
        state = '';
        rl.prompt();
      });
      break;
    case 'recording':
      state = '';
      clearTimeout(recordingTimeout);
      currentRecorder && currentRecorder.stop();
      break;
    case 'playmessagequestion':
      state = '';
      console.log('got answer: ', line.trim().toLowerCase());
      if (line.trim().toLowerCase().startsWith('y')) {
        var msg = gReceivedMessages.pop();
        console.log('playback message: ', msg.type);
        switch (msg.type) {
          case 'emoji':
            console.log(msg.data);
            rl.prompt();
            break;
          case 'audio':
          case 'voice':
            playBufferAsAudio(msg.data, msg.contentType).then(() => {
              console.log('playback complete');
              rl.prompt();
            }).catch((err) => {
              console.log('error with playback', err);
              rl.prompt();
            });
            break;
          default:
            console.log('Unknown message type: ', msg);
        }
      } else {
        console.log('huh, ok');
        rl.prompt();
      }
      break;
    default:
      handleCommand(line).then(result => {
        if (result) {
          rl.prompt();
        }
      });
  }
}).on('close', () => {
  console.log('Have a great day!');
  process.exit(0);
});
