const express = require('express');
const app = express();
const cors = require('cors')
const port = 3001;

const sqlite = require('sqlite');
const dbPromise = sqlite.open('./db/gtfs.db', { Promise });

app.use(cors());

app.listen(port, () => {
  console.log("Listening");
});

app.get('/api/stations', async (req, res, next) => {
  try {
    const db = await dbPromise;
    const [ stations ] = await Promise.all([
      db.all('select stop_id, stop_name from gtfs_stops')
    ]);
    res.send(stations);
  }
  catch (err) {
    next(err);
  }
});
