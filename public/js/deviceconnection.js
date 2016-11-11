(function(exports) {
'use strict';

  function DeviceConnection(id, config) {
    this.id = id;
    this.config = Object.assign({
      signalingURLProtocol: 'ws:',
      signalingURLHostname: '0.0.0.0',
      signalingURLPort: '8080',
      signalingURLPath: '/'
    }, config);
    this._handlers = {};
  }
  DeviceConnection.prototype = {
    dataChannel: null,

    logError: function(error) {
      console.log(
        'ERROR: ' + this.deviceId + ':' +
        error.name + ': ' + error.message
      );
    },
    log: function() {
      var args = Array.prototype.slice.apply(arguments);
      args.unshift('LOG:' + this.id + ':')
      console.log.apply(console, args);
    },

    get signalingUrl() {
      var url = '';
      var config = this.config;
      url += config.signalingURLProtocol;
      url += '//';
      url += config.signalingURLHostname;
      url += ':';
      url += config.signalingURLPort;
      url += config.signalingURLPath;
      url += '?deviceid=' + this.id;
      return url;
    },

    connect: function() {
      var localDescCreated = (desc) => {
        this.log('localDescCreated');
        this.peerConnection.setLocalDescription(desc, () => {
          this.signalingSocket.send(JSON.stringify({
            'sdp': this.peerConnection.localDescription
          }));
        }, this.logError.bind(this));
      };

      return this.openSignalingSocket()
      .catch((err) => {
        this.logError(err);
      })
      .then((ws) => {
        this.createPeerDataChannel();

        this.log('signaling ws open: ', this.signalingSocket);
        this.log('peerConnection created: ', this.peerConnection);
        this.log('dataChannel open: ', this.dataChannel);
        var pc = this.peerConnection;
        var ws = this.signalingSocket;

        // hook up the rest of the handlers for the peer connection
        pc.onicecandidate = (evt) => {
          // send any ice candidates to the other peer
          this.log('onicecandidate');
          if (evt.candidate) {
            ws.send(JSON.stringify({
              'candidate': evt.candidate
            }));
          }
        };

        // 'negotiationneeded' is not getting fired?
        pc.onnegotiationneeded = () => {
          this.log('onnegotiationneeded');
          pc.createOffer(localDescCreated, this.logError.bind(this));
        }

        pc.ondatachannel = (dataChannelEvent) => {
          // once remote data arrives, show it
          this.log('got datachannel on this peerConnection:', dataChannelEvent);
          var channel = dataChannelEvent.channel;
          var parts = [];
          channel.onopen = function(evt) {
            this.log('channel opened:', channel, evt);
            this.emit('datachannelopen', evt);
          }.bind(this);
          channel.onclose = function() {
            this.emit('datachannelclose', evt);
            this.log('channel closed');
          }.bind(this);
          channel.onmessage = function(evt) {
            this.emit('datachannelmessage', evt);
          }.bind(this);
        };

        // hook up the rest of the handlers on the signalling websocket
        ws.onmessage = (evt) => {
          var message = JSON.parse(evt.data.toString());
          if (message.welcome) {
            this.log('got welcome message: ', message);
          } else if (message.makeOffer) {
            this.log('got makeOffer ws message');
            this.peerConnection.createOffer(localDescCreated, this.logError.bind(this));
          }
          else if (message.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
              // if we received an offer, we need to answer
              if (pc.remoteDescription.type == 'offer') {
                pc.createAnswer(localDescCreated, this.logError.bind(this));
              }
            }, this.logError.bind(this));
          }
          else if (message.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          }
        };
        ws.onclose = () => {
          this.log('signaling websocket connection closed');
          if (this._reconnectOnClose) {
            setTimeout(this.connect.bind(this), 0);
          }
        };
        ws.onerror = this.logError;
      })
      .catch((e) => {
        this.logError(e);
      });
    },
    openSignalingSocket: function() {
      // open a websocket to the signaling server
      // exchange offers and open a WebRTC DataChannel to the peer
      var deviceId = this.id;
      var signalingUrl = this.signalingUrl;
      this.log('signalingUrl: ', signalingUrl);

      var ws = this.signalingSocket;
      return new Promise((res, rej) => {
        var wsReadyState = ws && ws.readyState;
        console.log('openSignalingSocket, wsReadyState: ', wsReadyState);
        switch (wsReadyState) {
          case 0:
            // connecting
            console.log('socket is connecting, resolve');
            ws.onopen = () => { res(ws) };
            break;
          case 1:
            // already open, we can use as-is
            console.log('socket already open, resolve');
            setTimeout(() => { res(ws)}, 0);
            break;
          case 2:
            // connection is closing, fall thru'
          default:
            ws = this.signalingSocket = new WebSocket(signalingUrl);
            ws.onopen = () => {
              console.log('new socket open, resolve');
              res(ws)
            };
        }
      });
    },

    createPeerDataChannel: function() {
      console.log('openDataChannelToPeer');

      var pc = this.peerConnection;
      var pcConnectionState = pc && pc.connectionState;
      switch (pcConnectionState) {
        case 'new':
        case 'connecting':
        case 'connected':
          // TODO: some timeout or other failed-to-eventually-connect handling here?
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
        default:
          pc = this.peerConnection = new RTCPeerConnection({
            iceServers: this.config.iceServers
          });
          console.log('created new peerConnection');
          break;
      }
      var dataChannel = this.dataChannel;
      var dataReadyState = dataChannel && dataChannel.readyState;
      if (!dataChannel ||
          dataChannel.readyState === 2 || dataChannel.readyState === 3) {
        dataChannel = pc.createDataChannel(this.config.dataChannelLabel);
        this.dataChannel = dataChannel;
        console.log('created new dataChannel:', dataChannel.readyState, dataChannel);
      }
      return dataChannel;
    },
    disconnect: function() {
      this.log('TODO: implement disconnect');
    },
    sendMessage: function(msg) {
      this.dataChannel.send(msg);
    },
    _handlers: null,
    on: function(name, callback) {
      this.log('on: register callback for ' + name, callback);
      var callbacks = this._handlers[name] || (this._handlers[name] = []);
      callbacks.push(callback);
    },
    emit: function(name, event) {
      var callbacks = this._handlers[name];
      if (callbacks) {
        callbacks.forEach(callback => {
          callback(event);
        });
      }
    }
  };


  exports.DeviceConnection = DeviceConnection;
})(window)