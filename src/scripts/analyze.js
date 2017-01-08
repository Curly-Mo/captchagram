import {get_intersections} from '../lib/sat';
import config from '../config.json';
import db from '../db';

let argv = require('yargs')
  .usage('Usage: $0 <command> [options]')
  .describe('max_duration', 'Skip events longer than this (in ms)').default('max_duration', 20000)
  .describe('min_events', 'Minimum events agreeing on an intersection').default('min_events', 3)
  .describe('onset_thresh', 'Threshold of onset for events to agree (in ms)').default('onset_thresh', 1500)
  .describe('duration_thresh', 'Threshold of duration for events to agree (ratio)').default('duration_thresh', 0.6)
  .describe('onset_offset', 'Add this to the average onset of an intersection (in ms)').default('onset_offset', -300)
  .help('h')
  .alias('h', 'help')
  .argv;


Object.assign(config, argv);
get_intersections(db, config, function(events){
  //console.log(events);
});
