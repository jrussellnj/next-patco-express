const express = require('express');
const cors = require('cors')
const strftime = require('strftime');
const sqlite = require('sqlite');

const app = express();
const port = 3001;
const dbPromise = sqlite.open('./db/gtfs.db', { Promise });

app.use(cors());

app.listen(port, () => { });

// Get the list of stations in order from east to west
app.get('/api/stations', async (req, res, next) => {
  try {
    const db = await dbPromise;
    const [ stations ] = await Promise.all([
      db.all('select stop_id, stop_name, slug from gtfs_stops order by cast(stop_id as integer) asc')
    ]);

    res.send(stations);
  }
  catch (err) {
    next(err);
  }
});

// Get the stop times for a given station
app.get('/api/station/times', async (req, res, next) => {

  // Get the database handler
  const db = await dbPromise;

  // Get the station from the database
  const [[  theStation ]] = await Promise.all([
    db.all('select stop_id, stop_name, slug from gtfs_stops where slug = ?', req.query.stationSlug)
  ]);

  // Get the stop times for the station
	let stopTimes = await getStopTimes(new Date(), theStation.stop_id);

	let toPhiladelphia = [];
	let toLindenwold = [];

  stopTimes.forEach((time) => {
    // route_id of '2' is to Philadelphia, '1' is to Lindenwold
    if (time.route_id == '2') {
      toPhiladelphia.push(time);
    }
    else {
      toLindenwold.push(time);
    }
  });

  // If either direction has fewer than three times, go to the next day
/*
    if @toPhiladelphia.count < 3 or @toLindenwold.count < 3
      @times = getStopTimes((@dateToUse + 1.day).beginning_of_day)

      @times.each do |s|
        # Note: route_id of 1 is to LINDENWOLD and
        # route_id of 2 is to PHILADELPHIA
        if (s.route_id == "2")
          @toPhiladelphia.push(s)
        elsif (s.route_id == "1")
          @toLindenwold.push(s)
        end
      end
    end
*/

  res.send({
    stationName: theStation.stop_name,
    toPhiladelphia: toPhiladelphia,
    toLindenwold: toLindenwold
  });
});

// Get stop times to Philadelphia and Lindenwold for the given station at the given time
const getStopTimes = async (dateToUse, stationId) => {

  // Get the database handler
  const db = await dbPromise;

  // Get the station and do a holiday check on today's date
  const [ holidayCheck ] = await Promise.all([
    db.all('select * from gtfs_calendar_dates where date = ? and exception_type = 1', strftime('%Y%m%d', dateToUse))
  ]);

  let todaysServiceId = null;

  if (holidayCheck.length > 0) {

    // Today is a holiday, so use the service id in gtfs_calendar_ddates
    todaysServiceId = holidayCheck[0].service_id;
  }
  else {

    // If today is not a holiday, get the normal service id for today's day of the week
    [[ serviceId ]] = await Promise.all([
      db.all(`select * from gtfs_calendar where ${ strftime('%A', dateToUse).toLowerCase() } = 1 and ? between start_date and end_date`, strftime('%Y%m%d', dateToUse))
    ]);

    todaysServiceId = serviceId.service_id;
  }

  // Get the stop times
  const timesQuery = `
    select gtfs_stop_times.*, gtfs_trips.direction_id, gtfs_trips.route_id
    from gtfs_stop_times
    left join gtfs_trips on gtfs_stop_times.trip_id = gtfs_trips.trip_id
    where stop_id = ? and departure_time > ? and gtfs_trips.service_id = ?
    order by departure_time
    `;

  const [ stopTimes ] = await Promise.all([
    db.all(timesQuery, stationId, strftime('%H:%M:%S', dateToUse), todaysServiceId)
  ]);

  return stopTimes;
}
