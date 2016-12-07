import * as wordnet from '../lib/wordnet';
import SpellChecker from 'spellchecker';
import natural from 'natural';
let tokenizer = new natural.WordTokenizer();

// Remove any events with > MAX_DURATION
let MAX_DURATION = 20000;
// Remove intersections with less than MIN_EVENTS
let MIN_EVENTS = 3;
// Count intersections within +/-ONSET_THRESH in milliseconds
let ONSET_THRESH = 1000;
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

function find_intersections(events){
  let intersections = [];
  for(let i=0; i<events.length; i++){
    let current = events[i];
    let current_dur = current.end_time - current.start_time;
    let cluster = [current];
    let users = new Set([current.user_id]);
    for(let k=0; k<events.length; k++){
      if(i == k){continue;}
      let e = events[k];
      let e_dur = e.end_time - e.start_time;
      if(users.has(e.user_id)){continue;}
      if(Math.abs(e.start_time - current.start_time) <= ONSET_THRESH &&
         Math.abs(e_dur - current_dur) <= current_dur * DURATION_RATIO_THRESH){
        cluster.push(e);
        users.add(e.user_id);
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
  deduped = Object.values(deduped);

  return deduped;
}

function group_by(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

function label_filter(cluster, min_count, callback) {
  if(cluster.length < min_count){
    let result = {
      'events': [],
      'synset_ids': [],
      'lemmas': [],
    };
    setTimeout(function(){
      callback(result);
    }, 200);
    return;
  }
  let synset_counts = {};
  let semaphore = 0;
  cluster.forEach(function(event){
    event.syn_ids = new Set();
    event.labels = [];
    event.lemmas = new Set();
    event.related_ids = new Set();
    event.related_lemmas = new Set();
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
      tokens = tokens.filter(token => { return NG.indexOf(token) < 0; });
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
      semaphore += 1;
      wordnet.lookup_related(labels[i], function(synsets, related){
        semaphore -= 1;
        synsets.forEach(function(synset){
          let syn_id = synset.synsetOffset.toString();
          if(!(event.syn_ids.has(syn_id) || event.related_ids.has(syn_id))){
            synset_counts[syn_id] = (synset_counts[syn_id] || 0) + 1;
          }
          event.syn_ids.add(syn_id);
          synset.synonyms.forEach(function(lemma){
            event.lemmas.add(lemma);
          });
        });
        related.forEach(function(synset){
          let syn_id = synset.synsetOffset.toString();
          if(!(event.syn_ids.has(syn_id) || event.related_ids.has(syn_id))){
            synset_counts[syn_id] = (synset_counts[syn_id] || 0) + 1;
          }
          event.related_ids.add(syn_id);
          synset.synonyms.forEach(function(lemma){
            event.related_lemmas.add(lemma);
          });
        });
        if(semaphore == 0){
          filter(synset_counts, callback);
        }
      });
    }
    if(semaphore == 0){
      filter(synset_counts, callback);
    }
  });

  function filter(synset_counts, callback){
    let filtered = new Set();
    let labels = new Set();
    let synset_ids = new Set();
    let lemmas = new Set();
    let related_ids = new Set();
    let related_lemmas = new Set();
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
    };
    callback(result);
  }
}

export function get_intersections(db, callback){
  db.query(`
      SELECT event_id, user_id, events.seg_id, start_time, end_time, events.description, translation, file_name
      FROM events 
      JOIN segments ON segments.seg_id = events.seg_id
      ORDER BY events.start_time ASC
      `, function(err, rows, fields) {
    if (err){
      console.log(err);
    }
    // Remove events longer than 20 seconds
    rows = rows.filter(row => {return row.end_time - row.start_time < MAX_DURATION });

    let tracks = group_by(rows, 'seg_id');
    let intersections = [];
    Object.keys(tracks).forEach(function(key) {
      intersections = intersections.concat(find_intersections(tracks[key]));
    });
    let filtered = [];
    let semaphore = 0;
    intersections.forEach(function(intersection, i){
      semaphore += 1;
      label_filter(intersection, MIN_EVENTS, function(label_filtered){
        semaphore -= 1;
        console.log(semaphore);
        if(label_filtered.events.length > 0){
          filtered.push(label_filtered);
        }
        if(semaphore == 0){
          merge_events(filtered, callback);
        }
      });
    });
  });
}

function merge_events(filtered, callback){
  console.log('merging');
  //console.log(filtered);
  let event_objects = []
  filtered.forEach(function(item){
    let event_ids = [];
    let start_total = 0;
    let dur_total = 0;
    item.events.forEach(function(event){
      event_ids.push(event.event_id);
      start_total += event.start_time;
      dur_total += event.end_time - event.start_time;
    });
    let start_time = start_total / item.events.length + ONSET_OFFSET;
    let duration = dur_total / item.events.length;
    let end_time = start_time + duration;
    event_ids.sort();
    let obj = {
      id: parseInt(event_ids.join('')),
      event_ids: event_ids,
      start_time: start_time,
      end_time: end_time,
      file_name: item.events[0].file_name,
      labels: item.labels,
      synset_ids: item.synset_ids,
      related_synset_ids: item.related_ids,
      lemmas: item.lemmas,
      related_lemmas: item.related_lemmas,
    }
    event_objects.push(obj);
  });
  //console.log(event_objects);
  event_objects.forEach(function(e){
    console.log('id: ' + e.id);
    console.log('size: ' + e.event_ids.length);
    console.log('labels: ' + e.labels);
    console.log('lemmas: ' + e.lemmas);
  });
  console.log('total intersections:');
  console.log(event_objects.length);

  callback(event_objects);
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
