import http from 'http';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import initializeDb from './db';
import captcha from './captcha';
import analyze from './analyze';
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

// connect to db
initializeDb( db => {

	// captcha router
	app.use('/captcha', captcha({ config, db }));

    // client
    app.use('/client', express.static(__dirname + '/client'));
    app.use('/example', express.static(__dirname + '/client'));

	// analyze table
	app.use('/analyze', analyze({ config, db }));

	app.server.listen(process.env.PORT || config.port);

	console.log(`Started on port ${app.server.address().port}`);
});

export default app;
