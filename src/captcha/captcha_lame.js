import fs from 'fs';
import * as lame from 'lame';
import path from 'path';
import uuid from 'node-uuid';
import async from 'async';
import {random_sample, shuffle} from '../lib/util';
import {getAllSynsetIDs, getSynsetIDs} from '../lib/wordnet';
import {get_intersections} from '../lib/sat';
import NodeCache from 'node-cache';
const cache = new NodeCache({stdTTL: 300});

export function generate(req, res) {
  let token = uuid.v1();
  let known = random_sample(global.dataset, 1);
  let learning = random_sample(global.dataset, 1);
  let sounds = shuffle([known, learning]);
  let files = sounds.map(function(sound){ return sound.filepath });
  console.log(sounds[0].labels);
  console.log(sounds[1].labels);

  console.log(files);
  async.map(files, fs.readFile, function(err, buffers) {
    if(err) {
        throw err;
    }
    let streams = [];
    let semaphore = 0;
    buffers.forEach(function(buffer, i){
      semaphore += 1;
      let encoder = lame.Encoder({
        channels: 2,
        bitDepth: 16,
        sampleRate: 22050,
        bitRate: 128,
        outSampleRate: 22050,
        mode: lame.STEREO,
      });
      let decoder = lame.Decoder();
      decoder.bufs = [];
      encoder.bufs = [];
      decoder.on('format', function(format) {
        this.format = format;
      });
      decoder.on('data', function(data) {
        this.bufs.push(data);
      });
      decoder.on('end', function() {
        let buf = Buffer.concat(this.bufs);
        console.log(buf.length);
        let sr = this.format.sampleRate;
        sr = buf.length / 120.06;
        let start = Math.round(sr * sounds[i].start_time/1000);
        console.log(start);
        let end = Math.round(sr * sounds[i].end_time/1000);
        console.log(end);
        buf = buf.slice(start, end);
        console.log(buf.length);
        encoder.end(buf);
      });
      encoder.on('data', function(buffer) {
        this.bufs.push(buffer);
      });
      encoder.on('end', function() {
        semaphore -= 1;
        streams[i] = Buffer.concat(this.bufs).toString('base64');
        if(semaphore <= 0){
          var data = {
            token: token,
            streams: streams,
            suggestions: 'natural, human, musical, machine, animal'
          };
          res.json(data);
        }
      });
      decoder.end(buffer);
    });


    // Cache the token and answer for 5 minutes (300 secs)
    cache.set(token, {
      timestamp: new Date(Date.now()),
      answer: {
        index: sounds.indexOf(known),
        value: known.labels,
        synsets: known.synsets
      },
      learning: {
        index: sounds.indexOf(learning),
        value: learning
      },
      attempted: false,
      solved: false,
    });

  });
}

export function attempt(req, res) {
  let response = {};
  let token = req.body['token'];
  try{
    let actual = cache.get(token, true);
    actual.attempted = true;
    let timestamp = actual.timestamp;
    let errors = [];
    let user_answer = req.body['answer'+actual.answer.index].trim();
    // Use wordnet to test if user answer is a child of the actual label
    getSynsetIDs(user_answer).then(synset_ids => {
      let found = false;
      let actual_ids = actual.answer.synsets.map(Number);
      for(let i=0; i<synset_ids.length; i++){
        if(actual_ids.indexOf(synset_ids[i]) > 0){
          found = true;
          break
        }
      }
      if(found){
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
        throw 'User response is not related to known label';
      }
    }).catch(function(e){
      errors.push('Incorrect answer');
      response = {
        "success": false,
        "challenge_ts": timestamp.toISOString(),
        "hostname": req.headers.host,
        "error-codes": errors
      };
      res.json(response);
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
  console.log('initializing dataset wordnet synsets...');
  // Fake datasets until we have database integration
  get_intersections(db, function(dataset){
    // Get all synsetids for the known labels
    // This is slow, and so must be done up front instead of on-the-fly
    global.dataset = dataset;
    let semaphore = 0;
    dataset.forEach(function(item, i){
      item.labels.forEach(function(label){
        semaphore += 1;
        getAllSynsetIDs(label).then(synsetids => {
          item.synsets = (item.synsets || []).concat(synsetids);
          semaphore-=1;
          if(semaphore <= 0){
            console.log('finished init');
          }
        }).catch(e => {
          // We will get here if a known label is not recognized by WordNet
          // For now, just remove it from the dataset
          console.log(e);
          dataset.splice(i, 1);
        });
      });
      item.filepath = path.join(config.audioDir, item.file_name);
    });
  });
}
