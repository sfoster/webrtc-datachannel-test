'use strict';
const EventEmitter = require('events').EventEmitter;
var util = require('util');
var fs = require('fs');

function FileSender(dataChannel, options) {
  if (!(this instanceof FileSender)) return new FileSender();
  this.dataChannel = dataChannel;
  EventEmitter.call(this);
  if (options) {
    for (var key in options) {
      this[key] = options[key];
    }
  }
}
util.inherits(FileSender, EventEmitter);

Object.assign(FileSender.prototype, {
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
});

exports.FileSender = FileSender;
