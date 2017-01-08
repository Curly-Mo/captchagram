import { Router } from 'express';
import {get_intersections} from '../lib/sat';

export default ({ config, db }) => {
	let api = Router();

	api.get('/', (req, res) => {
    get_intersections(db, config, function(intersections){
      intersections.forEach(function(i){
        console.log(i.labels);
      });
      res.json(intersections);
    });
	});

	return api;
}
