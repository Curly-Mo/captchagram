import { version } from '../../package.json';
import { Router } from 'express';
import * as captcha from './captcha';

export default ({ config, db }) => {
	let api = Router();
  //captcha.init(config, db);

  // Index route, probably something like a homepage
	api.get('/', (req, res) => {
		res.json({ version });
	});

  // Captcha routes
	api.get('/generate', function(req, res){
    captcha.generate(req, res, db, config);
  });
	api.post('/attempt', function(req, res){
    let response = captcha.attempt(req, res, db);
  });
	api.post('/verify', function(req, res){
    let response = captcha.verify(req);
    res.json(response);
  });

	return api;
}
