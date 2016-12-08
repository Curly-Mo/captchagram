import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import uuid from 'node-uuid';
import {random_sample, shuffle} from '../lib/util';
import {get_intersections} from '../lib/sat';
import * as wordnet from '../lib/wordnet';
import NodeCache from 'node-cache';
const cache = new NodeCache({stdTTL: 300});

export function generate(req, res, db, config) {
  get_sounds(db, config, function(sounds, indices){
    let files = sounds.map(function(sound){ return sound.filepath });
    sounds.forEach(function(sound, i){
      if(i == indices['known']){
        console.log('required:');
      }
      console.log(sound.labels);
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
          send_data(outstreams, sounds, indices);
        }
      });
    });
  });

  function send_data(outstreams, sounds, indices){
    let dev = [
      sounds[0].labels.join(', '),
      sounds[1].labels.join(', '),
    ];
    dev[indices['known']] = 'required: ' + dev[indices['known']];
    let token = uuid.v1();
    var data = {
      token: token,
      streams: outstreams,
      suggestions: 'natural, human, musical, machine, animal',
      'For devs': dev,
    };

    // Return json response
    res.json(data);

    // Cache the token and answer for 5 minutes (300 secs)
    let known = sounds[indices['known']];
    let learning = sounds[indices['learning']];
    cache.set(token, {
      timestamp: new Date(Date.now()),
      known: {
        index: indices['known'],
        lemmas: known.lemmas,
        synsets: known.synset_ids,
        related_synsets: known.synset_ids,
        related_lemmas: known.related_lemmas,
      },
      learning: {
        index: indices['learning'],
        event: learning
      },
      attempted: false,
      solved: false,
    });
  }
}

export function attempt(req, res, db) {
  let response = {};
  let token = req.body['token'];
  try{
    let actual = cache.get(token, true);
    actual.attempted = true;
    let timestamp = actual.timestamp;
    let actual_ids = actual.known.synsets.map(Number);
    let related_ids = actual.known.related_synsets.map(Number);
    let errors = [];
    let user_answer = req.body['answer'+actual.known.index].trim();
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
        save_event(actual.learning, req, db);

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

function get_sounds(db, config, callback){
  db.query(`
      SELECT intersection_id, start_time, end_time, labels, agreed_labels, synset_ids, related_synset_ids, lemmas, segments.file_name
      FROM intersections
      JOIN segments ON segments.seg_id = intersections.seg_id
			ORDER BY RAND()
			LIMIT 1
  `, function(err, rows, k_fields) {
    if(err){
      console.log(err);
    } 
    let known = rows[0];
		db.query(`
        SELECT intersection_id, start_time, end_time, labels, agreed_labels, synset_ids, related_synset_ids, lemmas, segments.file_name, segments.scape_id, segments.seg_id
				FROM intersections
				JOIN segments ON segments.seg_id = intersections.seg_id
				WHERE intersection_id <> ?
				ORDER BY RAND()
				LIMIT 1
		`, [known.intersection_id], function(err2, rows, l_fields) {
			if(err2){
				console.log(err2);
			} 
      let learning = rows[0];
      let sounds = shuffle([known, learning]);
      sounds.forEach(function(item, i){
        item.filepath = path.join(config.audioDir, item.file_name);
        let serialized= ['labels', 'agreed_labels', 'synset_ids', 'related_synset_ids', 'lemmas'];
        serialized.forEach(function(field){
          item[field] = item[field].split(';');
        });
      });
      let indices = {};
      indices['known'] = sounds.indexOf(known);
      indices['learning'] = sounds.indexOf(learning);
      callback(sounds, indices);
    });
  });
}

function save_event(learning, req, db){
  let ip = req.socket.remoteAddress;
	let obj = {
    scape_id: learning.event.scape_id,
    seg_id: learning.event.seg_id,
    start_time: learning.event.start_time,
    end_time: learning.event.end_time,
    description: req.body['answer'+learning.index],
	}
	console.log(obj);
	let query = db.query('INSERT INTO heardcha_events SET ?, user_ip=INET6_ATON(?)', [obj, ip], function(err, result) {
		if(err){
			console.log(err);
		}
	});
}
