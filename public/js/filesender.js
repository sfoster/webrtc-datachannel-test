(function(exports) {
'use strict';

  function FileSender(dataChannel, options) {
    this.dataChannel = dataChannel;
    if (options) {
      for (var key in options) {
        this[key] = options[key];
      }
    }
    this._handlers = {};
  }

  FileSender.prototype = {
    totalSize: 0,
    lastChunkSize: 0,
    offset: 0,
    CHUNK_SIZE: 1024 * 16,
    fileBlob: null,
    contentType: null,

    _handlers: null,
    on: function(name, callback) {
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
    },
    emitError: function(name, message) {
      var err = new Error(message);
      console.warn(message);
      this.emit(name, err);
    },
    send: function(url) {
      if (url) {
        this.url = url;
      }
      console.assert(this.url);
      this.dataChannel.binaryType = 'blob';

      window.fetch(this.url)
      .catch(e => {
        console.error('Failed to fetch file: ', e);
        this.emit('fetcherror', e);
      })
      .then((res) => {
        return res.blob();
      }).then((fileBlob) => {
        this.fileBlob = fileBlob;
        console.log('fetched: ' + this.url, fileBlob);
        this.totalSize = fileBlob.size;
        this.contentType = fileBlob.type;
        this.sendHeader();
        window.setTimeout(this.nextChunk.bind(this), 0);
      }).catch((e) => {
        console.error('Failed to get blob from file: ', e);
        this.emit('bloberror', e);
      });
      // could return promise at completion?
    },
    nextChunk: function() {
      // TODO: abort or pause mid-send?

      console.log('next: totalSize: %s, offset: %s, lastChunkSize: %s',
                  this.totalSize, this.offset, this.lastChunkSize);
      if (this.totalSize > this.offset + this.lastChunkSize) {
        var chunk = this.fileBlob.slice(this.offset, this.offset+this.CHUNK_SIZE, this.contentType);
        this.sendChunk(chunk);
        this.offset += this.CHUNK_SIZE;
      } else {
        console.log('nextChunk, reached end of file: ', this.totalSize, this.offset + this.lastChunkSize);
        this.sendEOF();
        this.reset();
      }
    },
    sendHeader: function() {
      console.log('sendHeader');
      if (!(this.dataChannel && this.dataChannel.readyState == 'open')) {
        this.emitError('senderror',
          'dataChannel not open: ' + (this.dataChannel && this.dataChannel.readyState));
        return;
      }
      this.dataChannel.send('\n\n');
      this.dataChannel.send(JSON.stringify({
        contentType: this.contentType,
        url: this.url
      }));
    },
    sendEOF: function() {
      console.log('sendEOF');
      if (!(this.dataChannel && this.dataChannel.readyState == 'open')) {
        this.emitError('senderror',
          'dataChannel not open: ' + (this.dataChannel && this.dataChannel.readyState));
        return;
      }
      this.dataChannel.send('\n\n');
      this.emit('sendcomplete')
    },
    sendChunk: function(chunk) {
      this.lastChunkSize = chunk.size;
      if (!(this.dataChannel && this.dataChannel.readyState == 'open')) {
        this.emitError('senderror',
          'dataChannel not open: ' + (this.dataChannel && this.dataChannel.readyState));
        return;
      }
      this.dataChannel.send(chunk);
      window.setTimeout(this.nextChunk.bind(this), 0);
    },
    reset: function() {
      this.totalSize = 0;
      this.lastChunkSize = 0;
      this.offset = 0;
      this.fileBlob = null;
      this.contentType = null;
    }
  };

  exports.FileSender = FileSender;
})(window)