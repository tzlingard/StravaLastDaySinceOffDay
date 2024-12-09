const { json } = require('body-parser');

// Imports dependencies and sets up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  axios = require('axios'),
  StravaApiV3 = require('strava_api_v3'),
  { Client } = require('pg'),
  // creates express http server
  app = express().use(bodyParser.json());
  require('dotenv').config();   

var defaultClient = StravaApiV3.ApiClient.instance;

// Configure OAuth2 access token for authorization: strava_oauth
var strava_oauth = defaultClient.authentications['strava_oauth'];
strava_oauth.accessToken = null;

var activitiesApi = new StravaApiV3.ActivitiesApi(defaultClient);

async function addConsecutiveDaysMessage(objectId) {
    activitiesApi.getLoggedInAthleteActivities({perPage: 100}, function(error, data) {
        if (error) {
          console.error("Failed to get logged in athlete activites.", error);
        } else {
          console.log('getLoggedInAthleteActivities called successfully.');
          var runStreakDescription = "Run Streak: ";
          var consecutiveRuns = getConsecutiveRuns(data);
          if (consecutiveRuns == null) {
            runStreakDescription += "No off days found!";
          } else {
            if (consecutiveRuns < 5) {
                runStreakDescription += consecutiveRuns;
            } else if (consecutiveRuns >= 5 && consecutiveRuns < 10) {
              runStreakDescription += "  🔥 " + consecutiveRuns + " 🔥";
            } else if (consecutiveRuns >= 10 && consecutiveRuns < 15) {
              runStreakDescription += "🔥🔥 " + consecutiveRuns + " 🔥🔥";
            } else if (consecutiveRuns >=15) {
              runStreakDescription += "🔥🥵 " + consecutiveRuns + " 🥵🔥";
            }
          }
          console.log(runStreakDescription);
          activitiesApi.getActivityById(objectId, {'includeAllEfforts': false}, function(error, data) {
            if (error) {
                console.error("Failed to get activity "+ objectID + " by ID. " + error);
            } else {
                var description = data.description ? data.description+"/n/n"+runStreakDescription : runStreakDescription;
                var activityUpdate = {
                  'commute': data.commute,
                  'trainer': data.trainer,
                  'hide_from_home': data.hide_from_home,
                  'description': description,
                  'name': data.name,
                  'sport_type': data.sport_type,
                  'gear_id': data.gear_id
                }
                var opts = {
                    'body': activityUpdate
                  }
                activitiesApi.updateActivityById(objectId, opts, function(error, data) {
                    if (error) {
                        console.error(error);
                    } else {
                        console.log('updateActivityByID called successfully.');
                    }
                })
            }
          });
        }
    });
}
  
function getConsecutiveRuns(activities) {
    const runs = activities.filter(getRuns);
    // Activities are sorted by start date, with the most recent first
    var lastDayWithoutRun = null;
    const mostRecentRunDate = runs[0]["start_date_local"];
    mostRecentRunDate.setHours(0,0,0,0);
    const mostRecentRunDateTime = runs[0]["start_date_local"].getTime();

    var nextRunDate = runs[0]["start_date_local"];
    for (let i=1; i<runs.length; i++) {
        var runDate = runs[i]["start_date_local"];
        runDate.setHours(0,0,0,0);
        var dayBeforeNextRun = nextRunDate;
        dayBeforeNextRun.setDate(nextRunDate.getDate()-1);
        dayBeforeNextRun.setHours(0,0,0,0);
        // if the day before the most recent activity is more recent than the current (earlier) activity day
        // ie. if the activity is more than a day before the next activity
        console.log("current run name: " + runs[i]['name'] + ", days between runs = "+(runDate.getTime() - dayBeforeNextRun.getTime()) / (1000*3600*24));
        if (runDate.getTime() < dayBeforeNextRun.getTime()) {
            console.log("Off day found!");
            lastDayWithoutRun = dayBeforeNextRun;
            var timeSinceLastOffDay = mostRecentRunDateTime - lastDayWithoutRun.getTime();
            return timeSinceLastOffDay / (1000 * 3600 * 24); // number of days since last off day
        } else {
            nextRunDate = runDate;
        }
    }
    return null;
}

function getRuns(activity) {
    return activity["type"] === "Run" || activity["type"] === "TrailRun" || activity["type"] === "VirtualRun";
}

// Sets server port and logs message on success
app.listen(process.env.PORT || 80, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook
app.post('/webhook', async (req, res) => {
    console.log("webhook event received!", req.query, req.body);
    res.status(200).send('EVENT_RECEIVED');
    // Parses the query params
    let objectType = req.body['object_type'];
    let objectId = req.body['object_id'];
    let aspectType = req.body['aspect_type'];
    let ownerId = req.body['owner_id'];

    // Checks if the correct event data fields are present
    if (objectType && objectId && aspectType && ownerId) {
        // Only trigger update when creating an activity
        if (objectType === 'activity' && aspectType === 'create') {  
                handleActivityCreate(objectId, ownerId);
            }
        }
    });

async function handleActivityCreate(objectId, ownerId) {
    console.log("Activity created, querying database for authData...");
    try {
        const client = new Client({
            connectionString: process.env.PGCONNECTIONSTRING
        });
        await client.connect();
        const data = await client.query('SELECT * FROM user_data WHERE athleteId=$1', [ownerId]);
        if (data && data.rowCount) {
            console.log("data found: "+JSON.stringify(data));
                let payload = {
                    "client_id":process.env.CLIENT_ID,
                    "client_secret":process.env.CLIENT_SECRET,
                    "refresh_token":data.rows[0].refreshToken,
                    "grant_type":"refresh_token"
                };
                if (data.rows[0].expires_at < Math.floor(Date.now() / 1000)) {
                    console.log("Attempting refresh token with payload: "+ JSON.stringify(payload));
                    let response = await axios.post('https://www.strava.com/api/v3/oauth/token', payload);
                    try {
                        await client.query('UPDATE user_data SET accessToken = $1, refreshToken = $2, expiresAt = $3 WHERE athleteId=$1 RETURNING *', 
                        [response.data['access_token'], response.data['refresh_token'], response.data['expires_at'], ownerId]);
                        strava_oauth.accessToken = response.data['access_token'];
                        console.log("Updated authentication data");
                    } catch (err) {
                        console.log("Error updating authentication data: "+err);
                    }
                }
            activitiesApi.getActivityById(objectId, {'includeAllEfforts':false}, async function(error, data) {
                if (error) {
                    console.log(`Failed to get object ${objectId} by ID . ${error}`);
                } else {
                    if (data['type'] == 'Run' || data['type'] == 'TrailRun' || data['type'] == 'VirtualRun') {
                        console.log('RUNNING RUN STREAK SCRIPT');
                        await addConsecutiveDaysMessage(objectId);
                    } else {
                        console.log("Not a run, Run Streak script not triggered.");
                    }
                }
            });
        } else {
            console.log("No authentication data found for athlete with ID "+ownerId);
        }
    } catch(err) {
        console.log("Error querying authData: " + err);
    }
}

// Adds support for GET requests to our webhook
app.get('/webhook', async (req, res) => {
  console.log("Verify webhook request received", req.query, req.body);
  // Your verify token. Should be a random string.
  const VERIFY_TOKEN = "STRAVA";
  // Parses the query params
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  // Checks if a token and mode is in the query string of the request
  if (mode && token) {
    // Verifies that the mode and token sent are valid
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {     
      // Responds with the challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.json({"hub.challenge":challenge});  
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);      
    }
  }
});

app.get('/callback', async (req, res) => {
    console.log("Exchange token request received!", req.query, req.body);
    let code = req.query['code'];
    var authData;
    if (code) {
        let payload = {
            "client_id":process.env.CLIENT_ID,
            "client_secret":process.env.CLIENT_SECRET,
            "code":code,
            "grant_type":"authorization_code"
        };
        try {
            authData = await axios.post('https://www.strava.com/api/v3/oauth/token', payload);
        }
        catch (error) {
            console.log("Error exchanging authentication tokens", error);
            res.status(400).send("Failed to authenticate with Strava.");
        }
        try {
            // add the authData to the database, or update the existing document with the new authData
            const client = new Client({
                connectionString: process.env.PGCONNECTIONSTRING
            });
            client.connect();
            let queryText = 'INSERT INTO user_data(athleteId, accessToken, refreshToken, expiresAt) VALUES($1, $2, $3, $4) ON CONFLICT(athleteId) DO UPDATE SET accessToken = $2';
            let queryValues = [authData.data['athlete']['id'], authData.data['access_token'], authData.data['refresh_token'], authData.data['expires_at']];
            console.log("Attempting SQL query: " + queryText + "\nWith values: "+queryValues);
            const dbResponse = await client.query(queryText, queryValues);
            console.log("Successfully added authentication data to database");
            strava_oauth.accessToken = authData.data['access_token'];
            console.log("Authenticated successfully");
            client.end();
        } catch (error) {
            console.log("Error storing authentication data in database", error.stack);
        } finally {
            payload = {
                "client_id":process.env.CLIENT_ID,
                "client_secret":process.env.CLIENT_SECRET,
                "callback_url": process.env.DOMAIN_NAME+"/webhook",
                "verify_token": "STRAVA"
            };
            console.log("Attempting subscribe to webhook with payload "+JSON.stringify(payload));
            try {
                let response = await axios.post('https://www.strava.com/api/v3/push_subscriptions', payload);
                let subscriptionId = response.data['id'];
                if (subscriptionId) {
                    console.log("Successfully subscribed to webhook.");
                    res.status(200).send("Successfully subscribed to Run Streak! You may unsubscribe by following the same link or revoking access on the Strava -> My Apps page.\n\nYou may close this page.");
                }
            } catch (error) {
                if (error.response.data.errors && error.response.data.errors.length) {
                    if (error.response.data.errors[0].resource === 'PushSubscription' && error.response.data.errors[0].code === 'already exists') {
                        console.log("Already subscribed, removing webhook subscription");
                        let response = await axios.get(`https://www.strava.com/api/v3/push_subscriptions?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}`);
                        let subscriptionId = response.data[0]['id'];
                        if (subscriptionId) {
                            await axios.delete(`https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}`);
                            console.log("Webhook successfully removed.");
                            res.status(200).send("You are now unsubscribed to Run Streak.\n\nYou may close this page.");
                        }
                    } else {
                        console.log("Error subscribing to webhook", error.response.data.errors);
                        res.status(400).send("Failed to subscribe to Strava's webhook.");
                    }
                }
            }
        }
    } else {
        res.status(400).send("Code required to authenticate with Strava.");
    }
});
app.use(express.static(`${__dirname}/frontend/build`));

app.get('/*', function (req, res) {
    res.redirect('http://stravarunstreak.onrender.com');
  });