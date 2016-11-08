var PORT = 8080;
var express = require('express');
var main = express();
var http = require('http');
var server = http.createServer(main)
var io  = require('socket.io').listen(server);
// io.set('log level', 1);

server.listen(PORT, null, function() {
    console.log("Listening on port " + PORT);
});
// main.use(express.bodyParser());

// From: https://github.com/anoek/webrtc-group-chat-example/blob/master/signaling-server.js

var DEFAULT_CHANNEL = 'foo';
var allChannels = {}; // each pair gets its own channel
var sockets =  {};
var deviceSocketsIdsMap =  {};

function getChannelForDeviceId(id) {
  var channelId = id.replace(/-[ab]$/i, '');
  return channelId;
}
function isValidDeviceId(id) {
  // TODO: some sanity check and lookup here
  return !!id;
}
function getChannelHost(channel) {
  for(var id in channel) {
    return id;
  }
}
/**
 * Devices will connect to the signaling server, passing a deviceid in the querystring.
 * Each device gets assigned to a channel based on its deviceid
 * The signaling server keeps track of all sockets who are in a channel,
 * and on alive will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' even they'll begin
 * setting up an RTCPeerConnection with one another. During this process they'll
 * need to relay ICECandidate information to one another, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother.
 */
io.sockets.on('connection', function(socket) {
  var deviceId = socket.handshake.query.deviceid;
  if (!isValidDeviceId(deviceId)) {
    console.warn('Unexpected socket connection, invalid device id');
    // probably better to do this in some auth/access-control middleware
    // as the client will probably just keep trying to connect
    socket.disconnect();
    return;
  }
  sockets[socket.id] = socket;
  deviceSocketsIdsMap[deviceId] = socket.id;
  console.log('socket connected, deviceid: ',  deviceId);

  socket.on('disconnect', function() {
    console.log('socket: ' + socket.id + ' disconnected');
    // signal to pair?
    delete sockets[socket.id];
    delete deviceSocketsIdsMap[deviceId];
  });

  var channelId = getChannelForDeviceId(deviceId);
  var channel = allChannels[channelId] || (allChannels[channelId] = {});
  var peerIds = Object.keys(channel)
  var isHost = !peerIds.length;

  socket.emit('welcome', {
    peers: peerIds
  });
  channel[deviceId] = socket;

  if (!isHost) {
    if (peerIds.length) {
      console.log('There are ' + peerIds.length + ' members in channel: ' + channelId);
    }
    var channelHost = getChannelHost(channel);

    // tell the channel host to offer a connection to the new peer
    channel[channelHost].emit('peerConnect', {
      'peerId': deviceId
    });
  }

  socket.on('relaySessionDescription', function(message) {
      var deviceId = message.to;
      var session_description = message.session_description;
      console.log("["+ deviceId + "] relaying session description to [" + deviceId + "] ", session_description);

      var socketId = deviceSocketsIdsMap[deviceId];
      var socket = socketId && sockets[socketId];
      if (socket) {
          socket.emit('sessionDescription', {
            'from': message.from,
            'to:': deviceId,
            'session_description': session_description});
      } else {
        console.warn('No socket found for deviceId: ' + deviceId + ' and socketId: ' + socketId);
      }
  });

  socket.on('relayICECandidate', function(config) {
      var peer_id = config.peer_id;
      var ice_candidate = config.ice_candidate;
      console.log("["+ socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);

      if (peer_id in sockets) {
          sockets[peer_id].emit('iceCandidate', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
      }
  });

});

io.sockets.on('disconnect', function(socket) {
  console.log('disconnect');
  var channelId = getChannelForDeviceId(socket.id);
  var channel = allChannels[channelId] || (allChannels[channelId] = {});

});