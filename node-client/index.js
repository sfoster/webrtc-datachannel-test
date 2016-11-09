var webrtc = require('./node-webrtc');
var WebSocket = require('ws');
var Sound = require('node-aplay');
var tmp = require('tmp');
var fs = require('fs');
var Url = require('url');

var RTCPeerConnection     = webrtc.RTCPeerConnection;
var RTCSessionDescription = webrtc.RTCSessionDescription;
var RTCIceCandidate       = webrtc.RTCIceCandidate;

/** CONFIG **/
var deviceId = process.env.HAIKU_DEVICE_ID || 'node-client-a';
var signalingHostname = (process.env.HAIKU_SIGNALING_HOSTNAME || '0.0.0.0');
var signalingPort = process.env.HAIKU_SIGNALING_PORT || '8080';
var signalingUrl = Url.parse('ws://' + signalingHostname + ':' + signalingPort + '/');

/** You should probably use a different stun server doing commercial stuff **/
/** Also see: https://gist.github.com/zziuni/3741933 **/
var ICE_SERVERS = [
  {urls:"stun:stun.l.google.com:19305"},
  {urls:"stun:stun1.l.google.com:19305"},
  {urls:"stun:stun2.l.google.com:19305"},
  {urls:"stun:stun3.l.google.com:19305"}
];

var configuration = {
  'iceServers': ICE_SERVERS
};
var pc;
var signalingChannel;
var dataChannel;

function start() {
  console.log('start');
  pc = new RTCPeerConnection(configuration);
  dataChannel = pc.createDataChannel('foo');

  // send any ice candidates to the other peer
  pc.onicecandidate = function (evt) {
    console.log('onicecandidate');
    if (evt.candidate) {
      signalingChannel.send(JSON.stringify({
        'candidate': evt.candidate
      }));
    }
  };

  // 'negotiationneeded' is not getting fired?
  pc.onnegotiationneeded = function () {
    console.log('onnegotiationneeded');
    pc.createOffer(localDescCreated, logError);
  }

  // once remote data arrives, show it
  pc.ondatachannel = function (evt) {
    console.log('got datachannel on this peerConnection:', evt);
    var channel = evt.channel;
    var parts = [];
    channel.onopen = function(evt) {
      console.log('channel opened:', channel, evt);
      console.log('channel onopen evt:', evt);
      dataChannel.send('hello from: ' + deviceId);
      if (deviceId.includes('-a')) {
        var fileSender = new FileSender(dataChannel);
        fileSender.send('./bird.wav', ' audio/x-wav');
      }
    }
    channel.onclose = function() {
      console.log('channel closed');
    }
    channel.onmessage = dataReceiver.onMessage.bind(dataReceiver);
  };
}

function localDescCreated(desc) {
  console.log('localDescCreated');
  pc.setLocalDescription(desc, function () {
    signalingChannel.send(JSON.stringify({
      'sdp': pc.localDescription
    }));
  }, logError);
}

function logError(error) {
  console.log(error.name + ': ' + error.message);
}

function connectAs(deviceId) {
  signalingUrl.search = '?deviceid='+deviceId;
  console.log('signalingUrl: ', Url.format(signalingUrl));

  signalingChannel = new WebSocket(Url.format(signalingUrl));

  signalingChannel.onmessage = function (evt) {
    var _message = evt.data.toString();
    if (!_message.includes('}')) {
      // is just a test/debug message
      console.log(_message);
      return;
    }
    var message = JSON.parse(_message);
    if (message.welcome) {
      console.log('got welcome message: ', message);
    } else if (message.makeOffer) {
      console.log('got makeOffer ws message');
      pc.createOffer(localDescCreated, logError);
    }
    else if (message.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), function () {
        // if we received an offer, we need to answer
        if (pc.remoteDescription.type == 'offer')
          pc.createAnswer(localDescCreated, logError);
      }, logError);
    }
    else if (message.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  };

  signalingChannel.on('open', function open() {
    signalingChannel.send('hi from: ' + deviceId);
    if (!pc) {
      start();
    }
  });
}

function playBufferAsAudio(buf, contentType) {
  // create tmp file
  // write the buffer to it
  // pass that tmp file to an external player

  tmp.file(function (err, path, fd, cleanup) {
    if (err) throw err;

    console.log("File: ", path);
    fs.writeFile(path, buf, function(err) {
      if (err) throw err;
      // NOTE: this works for wav files, but an .mp3 is getting garbled and results in noise
      (new Sound(path)).play();
      // if we don't need the file anymore - manually cleanup
      cleanup();
    });
  });
}

function toBuffer(ab) {
  // convert ArrayBuffer to Buffer
  var buf = Buffer.from(new Uint8Array(ab));
  return buf;
}

var dataReceiver = {
  state: '',
  contentType: null,
  chunks: [],
  completeFileReceived: function() {
    this.chunks.length = 0;
    this.contentType = null;
    this.state = '';
    var body = Buffer.concat(this.chunks);

    playBufferAsAudio(body, this.contentType);
    console.log('completeFileReceived, chunks: ', this.chunks);
  },
  onMessage: function(event) {
    console.log('onMessage:', event.data);
    var type = typeof event.data === 'string' ? 'string': 'arraybuffer';
    var nextState;
    console.log('onMessage, state: ' + this.state, type, event.data);
    switch (this.state) {
      case 'receiving-chunks' :
        if (type === 'string' && event.data === '\n\n') {
          this.completeFileReceived();
        } else if (type === 'arraybuffer') {
          this.chunks.push(toBuffer(event.data));
        } else {
          console.warn('unexpected message content: ', type, event);
        }
        break;
      case '' :
        if (type === 'string') {
          if (event.data.indexOf('{') > -1 &&
              event.data.indexOf('contentType') > -1) {
            var header = JSON.parse(event.data);
            this.contentType = header.contentType;
            this.state = 'receiving-chunks';
          } else {
            // generic message, unrelated to our file-sending/receiving
            console.log('DataChannel message: ', event.data);
          }
        } else {
          console.warn('unexpected message content: ', type, event);
        }
        break;
    }
  }
}

function FileSender(dataChannel, options) {
  this.dataChannel = dataChannel;
  if (options) {
    for (var key in options) {
      this[key] = options[key];
    }
  }
}

FileSender.prototype = {
  totalSize: 0,
  lastChunkSize: 0,
  offset: 0,
  CHUNK_SIZE: 1024 * 16,
  fileBlob: null,
  contentType: null,

  send: function(filename, contentType) {
    if (!(this.dataChannel && this.dataChannel.readyState == 'open')) {
      console.warn('Data channel not ready');
      return;
    }
    this.contentType = contentType || '';
    var dataChannel = this.dataChannel;
    dataChannel.binaryType = 'arraybuffer';

    var CHUNK_SIZE = 1024 * 16;
    var readStream = fs.createReadStream(filename, {
      'flags': 'r',
      'mode': 0666,
      'bufferSize': CHUNK_SIZE,
      'autoClose': true
    });
    this.sendHeader();
    readStream.on('data', function(data) {
      if (!(dataChannel && dataChannel.readyState == 'open')) {
        console.warn('Data channel not ready');
        return;
      }
      dataChannel.send(data);
    }.bind(this));
    readStream.on('close', function(data) {
      this.sendEOF();
    }.bind(this));
  },
  sendHeader: function() {
    console.log('sendHeader');
    if (!(this.dataChannel && this.dataChannel.readyState == 'open')) {
      console.warn('Data channel not ready');
      return;
    }
    this.dataChannel.send(JSON.stringify({
      contentType: this.contentType,
      url: this.url
    }));
  },
  sendEOF: function() {
    console.log('sendEOF');
    if (!(this.dataChannel && this.dataChannel.readyState == 'open')) {
      console.warn('Data channel not ready');
      return;
    }
    this.dataChannel.send('\n\n');
  }
};

connectAs(deviceId);
