import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

export function concat_audio(files, outpath){
  var ffm = ffmpeg();
  files.forEach(function(file){
    ffm = ffm.input(file)
      .videoFilters([
      {
        filter: 'afade',
        options: 'in:0:0.2'
      },
      {
        filter: 'afade',
        options: 'out:0:0.2'
      }
    ]);
  });
  ffm.on('error', function(err) {
    console.log('An error occurred: ' + err.message);
  })
  .on('end', function() {
    console.log('Merging finished !');
  });
  ffm.mergeToFile(outpath)
    .audioCodec('aac')
    .audioChannels(1);
  return ffm;
}

export function get_audio_paths() {
  var dir = path.dirname(require.main.filename);
  dir = path.join(dir, 'audio');
  var files = fs.readdirSync(dir);
  files = files.map(function (file) {
      return path.join(dir, file);
    }).filter(function (file) {
      return fs.statSync(file).isFile();
    });
  files = random_sample(files, 2);
  return files;
}

export function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}

export function random_element(array) {
  var value = array[Math.floor(Math.random() * array.length)];
  return value;
}

export function random_sample(array, n) {
  if(n == 1){
    return random_element(array);
  }
  var shuffled = shuffle(array);
  return shuffled.slice(0, n);
}

/** Creates a callback that proxies node callback style arguments to an Express Response object.
 *  @param {express.Response} res Express HTTP Response
 *  @param {number} [status=200]  Status code to send on success
 *
 *  @example
 *    list(req, res) {
 *      collection.find({}, toRes(res));
 *    }
 */
export function toRes(res, status=200) {
  return (err, thing) => {
    if (err) return res.status(500).send(err);

    if (thing && typeof thing.toObject==='function') {
      thing = thing.toObject();
    }
    res.status(status).json(thing);
  };
}
