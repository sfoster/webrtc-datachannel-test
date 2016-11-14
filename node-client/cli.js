const readline = require('readline');
var Recorder = require('./recorder').Recorder;
var Sound = require('node-aplay');

var emojiLookup = require('./emoticon2emoji.js');
var state = ''; // 'startrecording', 'recording', 'sending', ''

function handleCommand(line) {
  var cmd;
  var args;
  if (!line.includes(':')) {
    console.log(`you said: ${line}`);
    return Promise.resolve(true);
  }
  cmd = line.substring(0, line.indexOf(':')).trim();
  args = line.substring(line.indexOf(':')+1).trim();
  switch (cmd) {
    case 'say':
      args.trim().split(/\s+/).forEach(str => {
        var emoji = emojiLookup.get(str);
        console.log('TODO: send: ' + emoji);
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
  return new Promise((res, rej) => {
    console.log('sending...');
    setTimeout(() => {
      res(true);
    }, 1000);
  });
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
    recorder.on('recording', (details) => {
      console.log('recording to: ' + details.filename);
    });

    console.log('currentRecorder: ', !!currentRecorder);
    recorder.captureAudio({ filename: 'voice.wav', duration: 2 }).then((details) => {
      console.log('message sent sounds like this: ');
      var sound = new Sound(details.filename);
      sound.on('complete', () => {
        res(true);
      });
      sound.play();
    }).catch(reportError);
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
    case 'sending':
      break;
    case 'startrecording':
      state = 'recording';
      recordAudio().then(result => {
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
