var emojiLookup = require('./emoticon2emoji.js');
console.log(' :)', emojiLookup.get(':)'));
console.log(' :(', String.fromCodePoint( emojiLookup.getCodePoint(':(') ));
console.log('(thumbsup)', emojiLookup.get('(thumbsup)'));
console.log('(clap)', emojiLookup.get('(clap)'));

// commands (which eventually map to hardware actions):
// emoji selector: just accept e.g. emoji:(thumbsup)
// record audio: record:[ENTER]
// [ENTER] to end recording