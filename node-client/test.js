var emojiLookup = require('./emoticon2emoji.js');
console.log(' :)', emojiLookup.get(':)'));
console.log(' :(', String.fromCodePoint( emojiLookup.getCodePoint(':(') ));
console.log('(thumbsup)', emojiLookup.get('(thumbsup)'));
console.log('(clap)', emojiLookup.get('(clap)'));




// var Recording = require('node-arecord');
var sound = new Recording({
 debug: true,    // Show stdout
 destination_folder: '/tmp',
 filename: 'voicemessage.wav'
 // alsa_format: 'dat',
 // alsa_device: 'plughw:1,0'
});
sound.on('complete', function(evt) {
  console.log('recording done, its at: ', sound);
});

sound.record();
setTimeout(function() {
  sound.stop();
}, 5000);
// commands (which eventually map to hardware actions):
// emoji selector: just accept e.g. emoji:(thumbsup)
// record audio: record:[ENTER]
// [ENTER] to end recording