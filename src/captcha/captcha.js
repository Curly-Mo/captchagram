import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import uuid from 'node-uuid';
import {random_sample, shuffle} from '../lib/util';
import {get_intersections} from '../lib/sat';
import * as wordnet from '../lib/wordnet';
import NodeCache from 'node-cache';
const cache = new NodeCache({stdTTL: 300});

export function generate(req, res) {
  let token = uuid.v1();
  let known = random_sample(global.dataset, 1);
  let learning = random_sample(global.dataset, 1);
  let sounds = shuffle([known, learning]);
  let files = sounds.map(function(sound){ return sound.filepath });
  //console.log(sounds[0].lemmas);
  console.log(sounds[0].labels);
  //console.log(sounds[0].related_lemmas);
  //console.log(sounds[1].lemmas);
  console.log(sounds[1].labels);
  //console.log(sounds[1].related_lemmas);
  let semaphore = 0;
  let outstreams = [];
  files.forEach(function(file, i){
    semaphore += 1;
    let ffm = new ffmpeg(file);
    ffm.seekInput(sounds[i].start_time/1000);
    ffm.duration(sounds[i].end_time/1000 - sounds[i].start_time/1000);
    ffm.audioCodec('libmp3lame');
    ffm.format('mp3');
    let output = ffm.pipe({ end: true });
    output.buffers = [];
    output.on('data', function(b){
      this.buffers.push(b);
    });
    ffm.on('error', function(err, stdout, stderr) {
      console.log('Cannot process audio file: ' + err.message);
    });
    output.on('end', function(stdout, stderr) {
      console.log('Transcoding succeeded !');
      let buffer = Buffer.concat(this.buffers);
      outstreams[i] = buffer.toString('base64');
      semaphore--;
      if(semaphore == 0){
        send_data();
      }
    });
  });

  function send_data(){
    let index = sounds.indexOf(known);
    let dev = [
      sounds[0].labels.join(', '),
      sounds[1].labels.join(', '),
    ];
    dev[index] = 'required: ' + dev[index];
    var data = {
      token: token,
      streams: outstreams,
      suggestions: 'natural, human, musical, machine, animal',
      'For devs': dev,
    };

    // Return json response
    res.json(data);

    // Cache the token and answer for 5 minutes (300 secs)
    cache.set(token, {
      timestamp: new Date(Date.now()),
      answer: {
        index: sounds.indexOf(known),
        lemmas: known.lemmas,
        synsets: known.synset_ids,
        related_synsets: known.synset_ids,
        related_lemmas: known.related_lemmas,
      },
      learning: {
        index: sounds.indexOf(learning),
        value: learning
      },
      attempted: false,
      solved: false,
    });
  }
}

export function attempt(req, res) {
  let response = {};
  let token = req.body['token'];
  try{
    let actual = cache.get(token, true);
    actual.attempted = true;
    let timestamp = actual.timestamp;
    let actual_ids = actual.answer.synsets.map(Number);
    let related_ids = actual.answer.related_synsets.map(Number);
    let errors = [];
    let user_answer = req.body['answer'+actual.answer.index].trim();
    // Use wordnet to test if user answer is a child of the actual label
    wordnet.lookup(user_answer, function(results){
      let synset_ids = [];
      results.forEach(function(result){
        synset_ids.push(result.synsetOffset);
        result.ptrs.forEach(function(pointer){
          synset_ids.push(pointer.synsetOffset);
        });
      });
      let match = synset_ids.some(function(v) {
        return actual_ids.indexOf(v) >= 0 || related_ids.indexOf(v) >= 0;
      });
      if(match){
        response = {
          "success": true,
          "challenge_ts": timestamp.toISOString(),
          "hostname": req.headers.host,
          "error-codes": errors
        };
        res.json(response);
        //TODO: Function to save the users response as a ground truth will be called here
        // let other_index = (actual.answer.index + 1) % 2;
        // user_answer = req.body['answer'+other_index];
        // save_response(actual.learning, user_answer);

      }else{
        errors.push('Incorrect answer');
        response = {
          "success": false,
          "challenge_ts": timestamp.toISOString(),
          "hostname": req.headers.host,
          "error-codes": errors
        };
        res.json(response);
      }
    });
    // Update the cache, to mark it has been attempted and therefore no longer valid
    cache.set(token, actual);
  }catch(e){
    response = {
      success: false,
      hostname: req.headers.host,
      error: 'Invalid or expired Token.'
    };
    res.json(response);
  }
}

export function verify(req) {
  var timestamp = Date(Date.now());
  var response = {
    "success": false,
    // timestamp of the challenge load (ISO format yyyy-MM-dd'T'HH:mm:ssZZ)
    "challenge_ts": timestamp.toISOString(),
    // the hostname of the site where the reCAPTCHA was solved
    "hostname": 'example.com',
    // optional
    "error-codes": []
  }
  return response;
}


global.dataset = [];
export function init(config, db){
  console.log('initializing dataset'); 
  // Fake datasets until we have database integration
  get_intersections(db, function(dataset){
    // Get all synsetids for the known labels
    // This is slow, and so must be done up front instead of on-the-fly
    global.dataset = dataset;
    let semaphore = 0;
    dataset.forEach(function(item, i){
      item.filepath = path.join(config.audioDir, item.file_name);
    });
  });
}
