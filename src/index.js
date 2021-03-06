import http from 'http';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import db from './db';
import captcha from './captcha';
import config from './config.json';

let app = express();
app.server = http.createServer(app);

// 3rd party middleware
app.use(cors({
	exposedHeaders: config.corsHeaders
}));

app.use(bodyParser.json({
	limit : config.bodyLimit
}));
app.use(bodyParser.urlencoded({
  extended: true
}));

// captcha router
app.use('/captcha', captcha({ config, db }));

// client
app.use('/client', express.static(__dirname + '/client'));
app.use('/example', express.static(__dirname + '/client'));


app.server.listen(process.env.PORT || config.port);

console.log(`Started on port ${app.server.address().port}`);

export default app;
