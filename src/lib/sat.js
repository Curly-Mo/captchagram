import natural from 'natural';
let tokenizer = new natural.WordTokenizer();

// Bad words
let NG = ['sound', 'sounds', 'sounding', 'sounded', '\u0009', 'u0009', 'this', 'that', 'i', 'you', 'also', 'not', 'it', 'they', 'am', 'are', 'is', 'a', 'an', 'the', 'and', 'but', 'as', 'about', 'abreast', 'abroad', 'after', 'against', 'along', 'among', 'at', 'before', 'between', 'by', 'during', 'except', 'for', 'from', 'in', 'like', 'of', 'onto', 'than', 'through', 'throught', 'to', 'toward', 'towards', 'unlike', 'until', 'versus', 'with', 'without', 's']

// Hard-coded replacement words (mostly for poor translations)
let SUB_WORDS = {
  'new': 'bird',
  'aunt': 'woman',
  'english': 'speech',
  'pes': 'footstep',
}

function find_intersections(events){
  let onset_thresh = 1000;
  let dur_ratio_thresh = 0.7;
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
      if(Math.abs(e.start_time - current.start_time) <= onset_thresh &&
         Math.abs(e_dur - current_dur) <= current_dur * dur_ratio_thresh){
        cluster.push(e);
        users.add(e.user_id);
      }
    }
    intersections.push(cluster);
  }
  // Dedupe
  let deduped = intersections.filter((cluster, index, self) => self.findIndex((c) => {return JSON.stringify(Array.from(new Set(c)).sort()) == JSON.stringify(Array.from(new Set(cluster)).sort()) }));

  return deduped;
}

function group_by(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

function label_filter(cluster, min_count) {
  let label_counts = {};
  cluster.forEach(function(event){
    let labels = event.translation;
    if(labels == ''){
      labels = event.description;
    }
    if(labels == '' || labels == null) {return;}
    labels = labels.split(';');
    labels = labels.map(Function.prototype.call, String.prototype.trim);
    //dedupe (some users enter the same thing multiple times)
    labels = labels.filter((label, index, self) => self.findIndex((i) => {return i == label }) === index);

    for(let i=0; i<labels.length; i++){
      let tokens = tokenizer.tokenize(labels[i]);
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
      if(labels[i] != ''){
        label_counts[labels[i]] = (label_counts[labels[i]] || 0) + 1;
      }
    }
    event.labels = labels;
  });

  let filtered = new Set();
  let labels = [];
  Object.keys(label_counts).forEach(function (label) {
    let count = label_counts[label];
    if(count >= min_count){
      labels.push(label);
      cluster.forEach(function(event){
        if(event.labels.join(';').indexOf(label) >= 0){
          filtered.add(event);
        }
      });
    }
  });
  return {'events': Array.from(filtered), 'labels': labels};
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
    let max_dur = 20000;
    rows = rows.filter(row => {return row.end_time - row.start_time < max_dur });

    let tracks = group_by(rows, 'seg_id');
    let intersections = [];
    Object.keys(tracks).forEach(function(key) {
      intersections.push(find_intersections(tracks[key]));
    });
    let filtered = [];
    intersections.forEach(function(intersection){
      intersection.forEach(function(i){
        let label_filtered = label_filter(i, 2);
        if(label_filtered.events.length > 0){
          filtered.push(label_filtered);
        }
      });
    });
    let event_objects = []
    filtered.forEach(function(item){
      let id = '';
      let start_total = 0;
      let dur_total = 0;
      item.events.forEach(function(event){
        id += event.event_id;
        start_total += event.start_time;
        dur_total += event.end_time - event.start_time;
      });
      let start_time = start_total / item.events.length - 300;
      let duration = dur_total / item.events.length;
      let end_time = start_time + duration;
      let obj = {
        id: id,
        start_time: start_time,
        end_time: end_time,
        file_name: item.events[0].file_name,
        labels: item.labels,
      }
      event_objects.push(obj);
    });
    console.log('total intersections:');
    console.log(event_objects.length);

    callback(event_objects);
  });
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
