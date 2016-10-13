import fs from 'fs';
import uuid from 'node-uuid';
import async from 'async';
import {random_sample, shuffle} from '../lib/util';
import {isHypernymOf} from '../lib/wordnet';
import NodeCache from 'node-cache';
const cache = new NodeCache({stdTTL: 300});

export function generate(req, res) {
  let token = uuid.v1();
  let known = random_sample(known_dataset, 1);
  let learning = random_sample(learning_dataset, 1);
  let sounds = shuffle([known, learning]);
  let files = sounds.map(function(sound){ return sound.path });

  async.map(files, fs.readFile, function(err, buffers) {
    if(err) {
        throw err;
    }
    let streams = [];
    buffers.forEach(function(buffer){
      streams.push(buffer.toString('base64'));
    });

    var data = {
      token: token,
      streams: streams,
      suggestions: 'natural, human, musical, machine, animal'
    };

    // Cache the token and answer for 5 minutes (300 secs)
    cache.set(token, {
      timestamp: new Date(Date.now()),
      answer: {
        index: sounds.indexOf(known),
        value: known.label
      },
      learning: learning
    });
    res.json(data);
    res.on('finish', function(){
      console.log('stream finished');
    });
  });
}

export function attempt(req, res) {
  let success = false;
  let response = {};
  try{
    let actual = cache.get(req.body['token'], true);
    let timestamp = actual.timestamp;
    let errors = [];
    let user_answer = req.body['answer'+actual.answer.index];
    // Use wordnet to test if user answer is a child of the actual label
    isHypernymOf(user_answer, actual.answer.value).then(function(){
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


// Fake datasets until we have database integration
const known_dataset = [
  {
    label: 'dog',
    path: './audio/dog.wav'
  }
]

const learning_dataset = [
  {
    path: './audio/sax.wav'
  },
  {
    path: './audio/birds.wav'
  }
]
