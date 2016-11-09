var Sound = require('node-aplay');
var tmp = require('tmp');
var fs = require('fs');

function playBufferAsAudio(buf, contentType) {
  // create tmp file
  // write the buffer to it
  // pass that tmp file to an external player

  tmp.file(function (err, path, fd, cleanup) {
    if (err) throw err;

    console.log("File: ", path);
    fs.writeFile(path, buf, function(err) {
      if (err) throw err;
      console.log('wrote file, now play it');
      var audio = new Sound(path);
      audio.on('complete', function() {
        console.log('Done with playback');
        // if we don't need the file anymore we could manually call the cleanupCallback
        // cleanup();
      })
      audio.play();
    });
  });
}


fs.readFile('./bird.wav', function(err, buf) {
  if (err) throw err;
  playBufferAsAudio(buf, '');
});
