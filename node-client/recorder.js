var tmp = require('tmp');
var fs = require('fs');
var Path = require('path');
const EventEmitter = require('events').EventEmitter;
var util = require('util')
const spawn = require('child_process').spawn;

var MAX_RECORD_SECONDS = 60;
var RecorderOptions = {
  duration: 1+MAX_RECORD_SECONDS, // stop recording after n+1 seconds. Our setTimeout/kill should kick in first.
  maxFileTime: 60, // roll over into a new file after 60s. We should never hit this!
  filetype: 'wav',
  format: 'cd'
};

function Recorder(options) {
  if (!(this instanceof Recorder)) return new Recorder(options);
  EventEmitter.call(this);
  this.options = Object.create(RecorderOptions);
  if (options) {
    Object.assign(this.options, options);
  }
}
util.inherits(Recorder, EventEmitter);

Object.assign(Recorder.prototype, {
  captureAudio: function(_options) {
    var options = Object.create(this.options);
    if (_options) {
      Object.assign(options, _options);
    }
    console.log('captureAudio:', options);
    if (!options.processIdFile) {
      options.processIdFile = tmp.fileSync({ mode: 0644, postfix: '-arecord.pid' }).name;
    }
    console.log('options.processIdFile:', options.processIdFile);

    return new Promise((res, rej) => {
      this.getOutputFilename(options).then(filename => {
        options.filename = filename;
        this.emit('recording', options);
        var args = [
          '-f', options.format,
          '-t', options.filetype,
          '-d', options.duration,
          '-v',
          '--process-id-file', options.processIdFile,
          filename
        ];
        console.log('spawning arecord with args: ', args.join(' '));
        var cprocess = this._recordChildProcess = spawn('arecord', args, {
          cwd: process.cwd(),
          env: process.env,
          // child process can use our stdios
          stdio: 'inherit'
        });
        console.log('arecord pid: ', cprocess.pid);
        // ----------------
        // DEBUG
        // cprocess.stdout.on('data', function(data) {
        //   console.log('cprocess stdout: ', data.toString());
        // });
        // cprocess.stderr.on('data', function(data) {
        //   console.log('cprocess stderr: ', data.toString());
        // });
        // /DEBUG
        // ----------------

        cprocess.on('close', (code) => {
          console.log('cprocess closed: ', code);
          this.emit('complete', options);
          delete this._recordChildProcess;
          res(options);
        });

        // stop recording automatically after n seconds
        this._recordTimerId = setTimeout(() => {
          if(cprocess && cprocess.pid) {
            console.log('times up, killing ' + cprocess.pid + ' after ' + (MAX_RECORD_SECONDS*1000) + 'ms');
            cprocess.kill();
          }
          console.log('/killing');
        }, MAX_RECORD_SECONDS*1000);
      });
    });
  },
  getOutputFilename: function(options) {
    var cwd = process.cwd();
    var filename = options.filename;
    if (options.filename) {
      return Promise.resolve(Path.resolve(cwd, options.filename));
    }
    return new Promise((res, rej) => {
      console.log('getting tmpName output filename');
      tmp.tmpName((err, path) => {
        console.log('tmpName output filename:', path);
        if (err) throw err;
        res(path);
      });
    });
  },
  stop: function() {
    console.log('stop, has _recordChildProcess? ', this._recordChildProcess && this._recordChildProcess.pid);
    clearTimeout(this._recordTimerId);
    if (this._recordChildProcess) {
      this._recordChildProcess.kill('SIGINT');
    }
  }
});

exports.Recorder = Recorder;