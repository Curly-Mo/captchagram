import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import uuid from 'node-uuid';
import {random_sample, shuffle} from '../lib/util';
import * as wordnet from '../lib/wordnet';
import NodeCache from 'node-cache';
const cache = new NodeCache({stdTTL: 300});

let RMS_THRESH = 0.02;

export function generate(req, res, db, config) {
  get_sounds(db, config).then(function(sounds){
    let files = sounds.map(function(sound){ return sound.filepath });
    sounds.forEach(function(sound){
      if(sound.type == 'known'){
        console.log('required:');
      }
      console.log(sound.labels);
      console.log(sound.rms);
    });
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
          send_data(outstreams, sounds);
        }
      });
    });
  });

  function send_data(outstreams, sounds){
    let dev = [
      sounds[0].labels.join(', '),
      sounds[1].labels.join(', '),
    ];
    let indices = sounds.map(function(e) { return e.type; });
    let known = sounds[indices.indexOf('known')];
    let learning = sounds[indices.indexOf('learning')];
    dev[known.index] = 'required: ' + dev[known.index];
    let token = uuid.v1();
    let suggestions = sounds.map(function(sound){return sound.suggestions;});
    var data = {
      token: token,
      streams: outstreams,
      suggestions: suggestions,
      'For devs': dev,
    };

    // Return json response
    res.json(data);

    // Cache the token and answer for 5 minutes (300 secs)
    cache.set(token, {
      timestamp: new Date(Date.now()),
      known: known,
      learning: learning,
      attempted: false,
      solved: false,
    });
  }
}

export function attempt(req, res, db) {
  let response = {};
  let token = req.body['token'];
  var actual = cache.get(token);
  if(actual == undefined){
    console.log('Invalid token');
    response = {
      success: false,
      hostname: req.headers.host,
      error: 'Invalid or expired Token.'
    };
    res.json(response);
    return;
  }
  actual.attempted = true;
  let timestamp = actual.timestamp;
  let actual_ids = actual.known.synset_ids.map(Number);
  let related_ids = actual.known.related_synset_ids.map(Number);
  let errors = [];
  let user_answer = req.body['answer'+actual.known.index].trim();
  // Use wordnet to test if user answer is a child of the actual label
  console.log(user_answer);
  wordnet.lookup(user_answer).then(function(results){
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
      save_event(actual, req, db, true);
    }else{
      errors.push('Incorrect answer');
      response = {
        "success": false,
        "challenge_ts": timestamp.toISOString(),
        "hostname": req.headers.host,
        "error-codes": errors
      };
      res.json(response);
      save_event(actual, req, db, false);
    }
  });
  // Update the cache, to mark it has been attempted and therefore no longer valid
  cache.set(token, actual);
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

function get_sounds(db, config){
  return new Promise(function(resolve, reject){
    db.query(`
        SELECT intersection_id, start_time, end_time, labels, agreed_labels, synset_ids, related_synset_ids, lemmas, segments.file_name, segments.scape_id, segments.seg_id, rms
        FROM intersections
        JOIN segments ON segments.seg_id = intersections.seg_id
        ORDER BY RAND()
        LIMIT 1
    `, function(err, rows, k_fields) {
      if(err){
        console.log(err);
        reject(err);
      } 
      let known = rows[0];
      known.type = 'known';
      db.query(`
          SELECT intersection_id, start_time, end_time, labels, agreed_labels, synset_ids, related_synset_ids, lemmas, segments.file_name, segments.scape_id, segments.seg_id, rms
          FROM intersections
          JOIN segments ON segments.seg_id = intersections.seg_id
          WHERE intersection_id != ?
          AND (rms BETWEEN ? AND ?)
          ORDER BY RAND()
          LIMIT 1
      `, [known.intersection_id, known.rms-RMS_THRESH, known.rms+RMS_THRESH],
      function(err2, rows, l_fields) {
        if(err2){
          console.log(err2);
          reject(err2);
        } 
        if(rows.length < 1){
          console.log('No learning event to go with:');
          console.log(known);
          console.log('retrying...');
          resolve(get_sounds(db, config));
          return;
        }
        let learning = rows[0];
        learning.type = 'learning';
        let sounds = shuffle([known, learning]);
        let suggestion_promises = [];
        sounds.forEach(function(item, i){
          item.index = i;
          item.filepath = path.join(config.audioDir, item.file_name);
          let serialized= ['labels', 'agreed_labels', 'synset_ids', 'related_synset_ids', 'lemmas'];
          serialized.forEach(function(field){
            item[field] = item[field].split(';');
          });
          suggestion_promises.push(get_suggestions(db, 5, item));
        });
        let promise = Promise.all(suggestion_promises).then(function(suggestions){
          suggestions.forEach(function(s, i){
            sounds[i].suggestions = s;
          });
          resolve(sounds);
        }).catch(err => {
          console.log(err);
        });
      });
    });
  });
}

function save_event(actual, req, db, confirmed=false){
  let ip = req.socket.remoteAddress;
	let objects = [
    {
      scape_id: actual.known.scape_id,
      seg_id: actual.known.seg_id,
      start_time: actual.known.start_time,
      end_time: actual.known.end_time,
      description: req.body['answer'+actual.known.index],
      type: 'known',
      confirmed: confirmed,
    },
    {
      scape_id: actual.learning.scape_id,
      seg_id: actual.learning.seg_id,
      start_time: actual.learning.start_time,
      end_time: actual.learning.end_time,
      description: req.body['answer'+actual.learning.index],
      type: 'learning',
      confirmed: confirmed,
    }
  ];
	console.log(objects);
  objects.forEach(function(obj){
    let query = db.query('INSERT INTO heardcha_events SET ?, user_ip=INET6_ATON(?)', [obj, ip], function(err, result) {
      if(err){
        console.log(err);
      }
    });
  });
}

function get_suggestions(db, n, event){
  return new Promise(function(resolve, reject){
    let chance_of_including_correct = 0.3;
    let include_correct = Math.random() < chance_of_including_correct;
    db.query(`
        SELECT lemmas
        FROM intersections
        WHERE intersection_id != ?
        ORDER BY RAND()
        LIMIT ?
    `, [event.intersection_id, n-include_correct], function(err, rows, fields) {
      if(err){
        console.log(err);
        reject(err);
      } 
      rows.forEach(function(row){
        row.lemmas = row.lemmas.split(';');
      });
      if(include_correct){
        console.log('including the correct answer in suggestions');
        rows.push(event);
      }
      let labels = rows.map(function(row){ return row.lemmas; });
      labels = labels.map(function(label_set){ return random_sample(label_set, 1); });
      labels = Array.from(new Set(labels));
      labels.forEach(function(label, i){
        label = label.split('_').join(' ');
        label = label.split('(a)').join('').trim();
        label = label.split('(v)').join('').trim();
        label = label.split('(p)').join('').trim();
        label = label.toLowerCase();
        labels[i] = label;
      });
      labels = shuffle(labels);
      resolve(labels);
    });
  });
}
