function find_intersections(events){
  let intersections = [];
  for(let i=0; i<events.length; i++){
    let current = events[i];
    let cluster = [current];
    let users = new Set([current.user_id]);
    for(let k=0; k<events.length; k++){
      if(i == k){continue;}
      let e = events[k];
      if(users.has(e.user_id)){continue;}
      if(e.start_time < current.start_time && e.end_time > current.start_time ||
         e.start_time < current.end_time && e.end_time > current.end_time ||
         e.start_time >= current.start_time && e.end_time <= current.end_time){
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
    labels = labels.split(';').map(Function.prototype.call, String.prototype.trim);
    //dedupe (some users enter the same thing multiple times)
    labels = labels.filter((label, index, self) => self.findIndex((i) => {return i == label }) === index);
    event.labels = labels;
    labels.forEach(function(label){
      if(label != ''){
        label_counts[label] = (label_counts[label] || 0) + 1;
      }
    });
  });

  let filtered = new Set();
  let labels = [];
  Object.keys(label_counts).forEach(function (label) {
    let count = label_counts[label];
    if(count >= min_count){
      labels.push(label);
      cluster.forEach(function(event){
        if(event.labels.join(';').includes(label)){
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
      let start_time = item.events[0].start_time;
      let end_time = item.events[0].end_time;
      item.events.forEach(function(event){
        id += event.event_id;
        if(event.start_time < start_time){
          start_time = event.start_time;
        }
        if(event.end_time > end_time){
          end_time = event.end_time;
        }
      });
      let obj = {
        id: id,
        start_time: start_time,
        end_time: end_time,
        file_name: item.events[0].file_name,
        labels: item.labels,
      }
      event_objects.push(obj);
    });

    callback(event_objects);
  });
}
