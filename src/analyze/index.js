import { Router } from 'express';
import {get_intersections} from '../lib/sat';

export default ({ config, db }) => {
	let api = Router();

  // Index route, probably something like a homepage
	api.get('/', (req, res) => {
    get_intersections(db, function(intersections){
      res.json(intersections);
    });
	});

	return api;
}
