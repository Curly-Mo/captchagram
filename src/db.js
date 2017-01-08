import config from './config.json';
import * as mysql from 'mysql';

let db_config = {
  host     : 'localhost',
  user     : config.user,
  password : config.password,
  database : 'sat',
}

var pool = mysql.createPool(db_config);

module.exports = {
  query: function(){
    var sql_args = [];
    var args = [];
    for(var i=0; i<arguments.length; i++){
      args.push(arguments[i]);
    }
    var callback = args[args.length-1]; //last arg is callback
    pool.getConnection(function(err, connection) {
      if(err) {
        console.log(err);
        return callback(err);
      }
      if(args.length > 2){
        sql_args = args[1];
      }
      connection.query(args[0], sql_args, function(err, results) {
        connection.release(); // always put connection back in pool after last query
        if(err){
          console.log(err);
          return callback(err);
        }
        callback(null, results);
      });
    });
  }
};
