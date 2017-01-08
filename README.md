Captchagram
==================================

Confirm human users while collecting ground truth labels for soundscape events.

Getting Started
---------------

```sh
# Install dependencies
npm install

# Download wordnet database
cd ./data
./download_wordnet.sh

# Start development live-reload server
npm run dev

# Start production server:
npm start
```

Analysis
--------
To execute the script that populates the `intersections` table. This could perhaps be run *weekly* in a cron script.
```sh
npm run analyze
``` 

Config
------
src/config.json
```
{
  "port": 8080,
  "bodyLimit": "100kb",
  "corsHeaders": ["Link"],
  "audioDir": "Directory where audio files live on server",
  "user": "sql username",
  "password": "sql password"
}
```


License
-------

MIT
