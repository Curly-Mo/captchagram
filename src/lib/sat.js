import * as wordnet from '../lib/wordnet';
import {compute_rms} from '../lib/util';
import path from 'path';
import SpellChecker from 'spellchecker';
import natural from 'natural';
let tokenizer = new natural.WordTokenizer();
import NodeCache from 'node-cache';
const cache = new NodeCache();

// Remove any events with > MAX_DURATION
let MAX_DURATION = 20000;
// Remove intersections with less than MIN_EVENTS
let MIN_EVENTS = 3;
// Count intersections within +/-ONSET_THRESH in milliseconds
let ONSET_THRESH = 1500;
// Count intersections within +/-DURATION_RATIO_THRESH
let DURATION_RATIO_THRESH = 0.6;
// Add ONSET_OFFSET to intersection onsets in milliseconds
let ONSET_OFFSET = -300;

// Bad words
let NG = ['sound', 'sounds', 'sounding', 'sounded', '\u0009', 'u0009', 'this', 'that', 'i', 'you', 'also', 'not', 'it', 'they', 'am', 'are', 'is', 'a', 'an', 'the', 'and', 'but', 'as', 'about', 'abreast', 'abroad', 'after', 'against', 'along', 'among', 'at', 'before', 'between', 'by', 'during', 'except', 'for', 'from', 'in', 'like', 'of', 'onto', 'than', 'through', 'throught', 'to', 'toward', 'towards', 'unlike', 'until', 'versus', 'with', 'without', 's', 'noises', 'noise']

// Hard-coded replacement words (mostly for poor translations)
let SUB_WORDS = {
  'new': 'bird',
  'aunt': 'woman',
  'auntie': 'woman',
  'english': 'speech',
  'pes': 'footstep',
}

function find_intersections(events, config){
  let onset_thresh = config.onset_thresh || ONSET_THRESH;
  let duration_thresh = config.duration_thresh || DURATION_RATIO_THRESH;
  let intersections = [];
  for(let i=0; i<events.length; i++){
    let current = events[i];
    let current_dur = current.end_time - current.start_time;
    let cluster = [current];
    for(let k=0; k<events.length; k++){
      if(i == k){continue;}
      let e = events[k];
      let e_dur = e.end_time - e.start_time;
      if(Math.abs(e.start_time - current.start_time) <= onset_thresh &&
         Math.abs(e_dur - current_dur) <= current_dur * duration_thresh){
        cluster.push(e);
      }
    }
    intersections.push(cluster);
  }
  // Dedupe
  let deduped = {};
  intersections.forEach(function(cluster){
    let ids = [];
    cluster.forEach(function(event){
      ids.push(event.event_id);
    });
    let id = ids.sort().join('');
    deduped[id] = cluster;
  });
  deduped = Object.keys(deduped).map(function(key) {
    return deduped[key];
  });

  return deduped;
}

function group_by(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

function label_filter(cluster, min_count) {
  return new Promise(function(resolve, reject){
    if(cluster.length < min_count){
      let result = {
        'events': [],
        'synset_ids': [],
        'lemmas': [],
      };
      resolve(result);
      return;
    }
    let promises = [];
    cluster.forEach(function(event){
      event.syn_ids = new Set();
      event.labels = [];
      event.lemmas = new Set();
      event.related_ids = new Set();
      event.related_lemmas = new Set();
      event.agreed_labels = {};
      let labels = event.translation;
      if(labels == ''){
        labels = event.description;
      }
      labels = labels.split(';');
      labels = labels.map(Function.prototype.call, String.prototype.trim);
      //dedupe (some users enter the same thing multiple times)
      labels = labels.filter(
        (label, index, self) => self.findIndex((i) => {return i == label }) === index
      );

      for(let i=0; i<labels.length; i++){
        let tokens = tokenizer.tokenize(labels[i]);
        // SpellCheck
        tokens = tokens.map(token => {
          if(SpellChecker.isMisspelled(token)){
            let corrections = SpellChecker.getCorrectionsForMisspelling(token);
            if(corrections.length > 0){
              return corrections[0];
            }
          }
          return token;
        });
        // Remove 'Not Good' words
        tokens = tokens.filter(token => { return NG.indexOf(token.toLowerCase()) < 0; });
        // Replace SUB_WORDS
        tokens = tokens.map(token => {
          if(token in SUB_WORDS){
            return SUB_WORDS[token];
          }else{
            return token;
          }
        });
        // Remove numbers
        tokens = tokens.filter(token => { return !isNumeric(token); });
        labels[i] = tokens.join(' ');
        if(labels[i] == ''){continue;}
        event.labels.push(labels[i]);
        let promise = wordnet.lookup_related(labels[i]);
        promise = promise.then(function(r){
          r.unshift(event);
          return r;
        });
        promise.catch(function(e){
          console.log(e);
        });
        promises.push(promise);
      }
    });
    let all = Promise.all(promises);
    all.then(function(results){
      let synset_counts = {};
      let users = {};
      results.forEach(function(result, i){
        let event = result[0];
        let synsets = result[1];
        let related = result[2];
        synsets.forEach(function(synset){
          let syn_id = synset.synsetOffset.toString();
          if(!(event.syn_ids.has(syn_id) || event.related_ids.has(syn_id))){
            if(!(users[syn_id] || new Set()).has(event.user_id)){
              synset_counts[syn_id] = (synset_counts[syn_id] || 0) + 1;
              users[syn_id] = (users[syn_id] || new Set()).add(event.user_id);
            }
          }
          event.syn_ids.add(syn_id);
          event.lemmas.add(synset.lemma);
          synset.synonyms.forEach(function(lemma){
            event.related_lemmas.add(lemma);
          });
          event.agreed_labels[syn_id] = (event.agreed_labels[syn_id] || []).concat([event.labels[i]]);
        });
        related.forEach(function(synset){
          let syn_id = synset.synsetOffset.toString();
          if(!(event.syn_ids.has(syn_id) || event.related_ids.has(syn_id))){
            if(!(users[syn_id] || new Set()).has(event.user_id)){
              synset_counts[syn_id] = (synset_counts[syn_id] || 0) + 1;
              users[syn_id] = (users[syn_id] || new Set()).add(event.user_id);
            }
          }
          event.related_ids.add(syn_id);
          synset.synonyms.forEach(function(lemma){
            event.related_lemmas.add(lemma);
          });
          event.agreed_labels[syn_id] = (event.agreed_labels[syn_id] || []).concat([event.labels[i]]);
        });
      });
      resolve(filter(synset_counts));
    });

    function filter(synset_counts){
      return new Promise(function(resolve, reject){
        let filtered = new Set();
        let labels = new Set();
        let synset_ids = new Set();
        let lemmas = new Set();
        let related_ids = new Set();
        let related_lemmas = new Set();
        let agreed_labels = new Set();
        Object.keys(synset_counts).forEach(function (synset_id) {
          let count = synset_counts[synset_id];
          if(count >= min_count){
            cluster.forEach(function(event){
              if(Array.from(event.syn_ids).indexOf(synset_id) >= 0 ||
                 Array.from(event.related_ids).indexOf(synset_id) >= 0){
                filtered.add(event);
                event.labels.forEach(function(label){
                  labels.add(label);
                });
                event.syn_ids.forEach(function(synset_id){
                  synset_ids.add(synset_id);
                });
                event.related_ids.forEach(function(synset_id){
                  related_ids.add(synset_id);
                });
                event.lemmas.forEach(function(lemma){
                  lemmas.add(lemma);
                });
                event.related_lemmas.forEach(function(lemma){
                  related_lemmas.add(lemma);
                });
                (event.agreed_labels[synset_id] || []).forEach(function(label){
                  agreed_labels.add(label);
                });
              }
            });
          }
        });
        let result = {
          'events': Array.from(filtered),
          'synset_ids': Array.from(synset_ids),
          'related_ids': Array.from(related_ids),
          'labels': Array.from(labels),
          'lemmas': Array.from(lemmas),
          'related_lemmas': Array.from(related_lemmas),
          'agreed_labels': Array.from(agreed_labels),
        };
        resolve(result);
      });
    }
  });
}

export function get_intersections(db, config, callback){
  console.time('sql_query');
  db.query(`
      SELECT event_id, user_id, events.seg_id, start_time, end_time, events.description, translation, file_name, file_name
      FROM events 
      JOIN segments ON segments.seg_id = events.seg_id
      ORDER BY events.start_time ASC
  `, function(err, rows, fields) {
    if (err){
      console.log(err);
    }
    console.timeEnd('sql_query');
    console.time('rest');
    // Remove events longer than 20 seconds
    let max_dur = config.max_duration || MAX_DURATION;
    rows = rows.filter(row => {return row.end_time - row.start_time < max_dur });

    let tracks = group_by(rows, 'seg_id');
    let intersections = [];
    console.time('find_intersections');
    Object.keys(tracks).forEach(function(key) {
      intersections = intersections.concat(find_intersections(tracks[key], config));
    });
    console.timeEnd('find_intersections');
    let filtered = [];
    let promises = [];
    //intersections = intersections.slice(0,100);
    let remaining = intersections.length;
    let min_events = config.min_events || MIN_EVENTS;
    intersections.forEach(function(intersection){
      let promise = label_filter(intersection, min_events);
      promise.then(function(filtered){
        remaining -= 1;
        console.log('remaining: ' + remaining);
        return filtered;
      });
      promise.catch(function(e){
        console.log(e);
      });
      promises.push(promise);
    });
    Promise.all(promises).then(function(filtered){
      filtered = filtered.filter(function(i){ return i.events.length > 0; });
      merge_events(filtered, config, function(events){
        add_RMS(events, config).then(function(result){
          post(db, events);
          callback(events);
          console.timeEnd('rest');
        });
      });
    });
  });
}

function merge_events(filtered, config, callback){
  console.log('merging');
  //console.log(filtered);
  let event_objects = []
  filtered.forEach(function(item){
    let event_ids = [];
    let start_total = 0;
    let dur_total = 0;
    item.events.forEach(function(event){
      event_ids.push(parseInt(event.event_id));
      start_total += event.start_time;
      dur_total += event.end_time - event.start_time;
    });
    let offset = config.onset_offset || ONSET_OFFSET;
    let start_time = start_total / item.events.length + ONSET_OFFSET;
    let duration = dur_total / item.events.length;
    let end_time = start_time + duration;
    event_ids.sort(function(a, b){return a - b});
    let obj = {
      event_ids: event_ids.join(';'),
      start_time: start_time,
      end_time: end_time,
      seg_id: item.events[0].seg_id,
      file_name: item.events[0].file_name,
      labels: item.labels.join(';'),
      agreed_labels: item.agreed_labels.join(';'),
      synset_ids: item.synset_ids.join(';'),
      related_synset_ids: item.related_ids.join(';'),
      lemmas: item.lemmas.join(';'),
    }
    event_objects.push(obj);
  });
  //console.log(event_objects);
  event_objects.forEach(function(e){
    console.log('size: ' + e.event_ids.split(';').length);
    console.log('labels: ' + e.labels);
    console.log('good: ' + e.agreed_labels);
    console.log('lemmas: ' + e.lemmas);
  });
  console.log('total intersections:');
  console.log(event_objects.length);

  callback(event_objects);
}

function post(db, events){
  var query = db.query('TRUNCATE TABLE intersections', function(err, result) {
    if(err){
      console.log(err);
    }
    if(result){
      console.log(result);
    }
  });
  events.forEach(function(intersection){
    var query = db.query('INSERT INTO intersections SET ?', intersection, function(err, result) {
      if(err){
        console.log(err);
      }
    });
  });

}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function add_RMS(events, config){
  return new Promise(function(resolve, reject){
    let promises = [];
    events.forEach(function(event){
      let filepath = path.join(config.audioDir, event.file_name);
      delete event['file_name'];
      let promise = compute_rms(filepath, event.start_time, event.end_time).then(function(rms){
        event.rms = rms;
        return event;
      });
      promises.push(promise);
    });
    resolve(Promise.all(promises));
  });
}
