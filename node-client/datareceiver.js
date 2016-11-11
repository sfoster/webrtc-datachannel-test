"use strict";
const EventEmitter = require('events').EventEmitter;
var util = require('util')

function toBuffer(ab) {
  // convert ArrayBuffer to Buffer
  var buf = Buffer.from(new Uint8Array(ab));
  return buf;
}

function DataReceiver() {
  if (!(this instanceof DataReceiver)) return new DataReceiver();
  EventEmitter.call(this);
  this.chunks = [];
}
util.inherits(DataReceiver, EventEmitter);

Object.assign(DataReceiver.prototype, {
  state: '',
  contentType: null,
  chunks: null,

  completeFileReceived: function() {
    var body = Buffer.concat(this.chunks);
    this.emit('filereceived', {
      type: 'filereceived',
      data: body,
      contentType: this.contentType
    });
    this.chunks.length = 0;
    this.contentType = null;
    this.state = '';
  },
  onMessage: function(event) {
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
});

exports.DataReceiver = DataReceiver;
