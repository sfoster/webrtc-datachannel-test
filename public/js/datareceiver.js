(function(exports) {
'use strict';

  function DataReceiver() {
    this.chunks = [];
    this._handlers = {};
  }
  DataReceiver.prototype = {
    state: '',
    contentType: null,
    chunks: null,
    _handlers: null,
    on: function(name, callback) {
      var callbacks = this._handlers[name] || (this._handlers[name] = []);
      callbacks.push(callback);
    },
    emit: function(name, event) {
      console.log('emit ' + name, event);
      var callbacks = this._handlers[name];
      if (callbacks) {
        callbacks.forEach(callback => {
          callback(event);
        });
      }
    },
    completeFileReceived: function() {
      var fileBlob = new Blob(this.chunks, { type: this.contentType || '' });
      console.log('got fileBlob: ', fileBlob);
      this.chunks.length = 0;
      this.contentType = null;
      this.state = '';
      this.emit('filereceived', { type: 'filereceived', data: fileBlob });
    },
    onMessage: function(event) {
      var type = event.data instanceof Blob  ? 'blob': 'string';
      var nextState;
      console.log('onMessage, state: ' + this.state, ', data type: ' + type, event);
      switch (this.state) {
        case 'receiving-chunks' :
          if (type === 'string' && event.data === '\n\n') {
            console.log('got 2 linefeeds, call completeFileReceived');
            this.completeFileReceived();
          } else if (type === 'blob') {
            this.chunks.push(event.data);
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
  };

  exports.DataReceiver = DataReceiver;
})(window);