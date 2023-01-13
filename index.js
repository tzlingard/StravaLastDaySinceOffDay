
// Imports dependencies and sets up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  axios = require('axios'),
  StravaApiV3 = require('strava_api_v3'),
  path = require('path'),
  // creates express http server
  app = express().use(bodyParser.json());
  require('dotenv').config();   

  var defaultClient = StravaApiV3.ApiClient.instance;

var Datastore = require('nedb'), db = new Datastore();

// Configure OAuth2 access token for authorization: strava_oauth
var strava_oauth = defaultClient.authentications['strava_oauth'];
strava_oauth.accessToken = null;

var activitiesApi = new StravaApiV3.ActivitiesApi(defaultClient);

async function addConsecutiveDaysMessage(objectId) {
    activitiesApi.getLoggedInAthleteActivities({}, function(error, data, response) {
        if (error) {
          console.error("Failed to get logged in athlete activites.", error);
        } else {
          console.log('getLoggedInAthleteActivities called successfully.');
          var runStreakDescription = "Run Streak:\n";
          var consecutiveRuns = getConsecutiveRuns(data);
          if (consecutiveRuns == null) {
            runStreakDescription += "No off days found recently. Consider taking a day to rest and recover!";
          } else {
            if (consecutiveRuns < 5) {
                runStreakDescription += "    -- " + consecutiveRuns + " --";
            } else if (consecutiveRuns >= 5 && consecutiveRuns < 10) {
              runStreakDescription += "  🔥 " + consecutiveRuns + " 🔥";
            } else if (consecutiveRuns >= 10 && consecutiveRuns < 15) {
              runStreakDescription += "🔥🔥 " + consecutiveRuns + " 🔥🔥";
            } else if (consecutiveRuns >=15) {
              runStreakDescription += "🔥🥵 " + consecutiveRuns + " 🥵🔥";
            }
          }
          console.log(runStreakDescription);
          activitiesApi.getActivityById(objectId, {'includeAllEfforts': true}, function(error, data, response) {
            if (error) {
                console.error(error);
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
                activitiesApi.updateActivityById(objectId, opts, function(error, data, response) {
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
    const mostRecentRunDate = runs[0]["start_date"];
    mostRecentRunDate.setHours(0,0,0,0);
    const mostRecentRunDateTime = runs[0]["start_date"].getTime();

    var nextRunDate = runs[0]["start_date"];
    for (let i=1; i<runs.length; i++) {
    var runDate = runs[i]["start_date"];
    runDate.setHours(0,0,0,0);
    var dayBeforeNextRun = nextRunDate;
    dayBeforeNextRun.setDate(nextRunDate.getDate()-1);
    dayBeforeNextRun.setHours(0,0,0,0);
    // if the day before the most recent activity is more recent than the current (earlier) activity day
    // ie. if the activity is more than a day before the next activity
    if (runDate.getTime() < dayBeforeNextRun.getTime()) {
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
    return activity["type"] == "Run" || activity["type"] == "TrailRun" || activity["type"] == "VirtualRun";
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
            console.log("Activity created, querying database for authData...");
            db.find({ athleteId: ownerId}, async function(err, data) {
                if (err) {
                    console.error(err);
                } else {
                    console.log("authData found: "+JSON.stringify(data));
                    if (data) {
                        // Date.now() gives milliseconds since epoch, strava API gives seconds since epoch
                        if (data[0]["expiresAt"] < (Date.now() / 1000)) {
                            console.log("Access token expired, refreshing. expiresAt = "+data[0]["expiresAt"]+" , Date.now() = "+Date.now());
                            let payload = {
                                "client_id":process.env.CLIENT_ID,
                                "client_secret":process.env.CLIENT_SECRET,
                                "refresh_token":data[0]["refreshToken"],
                                "grant_type":"refresh_token"
                            };
                            let response = await axios.post('https://www.strava.com/api/v3/oauth/token', payload);
                            var authData = {
                                accessToken: response.data['access_token'],
                                refreshToken: response.data['refresh_token'],
                                expiresAt: response.data['expires_at'],
                                athleteId: ownerId
                            };
                            db.update({ athleteId: ownerId}, authData, { upsert: true });
                            strava_oauth.accessToken = response.data['access_token'];
                        }
                        console.log("Authenticated");
                        activitiesApi.getActivityById(objectId, {'includeAllEfforts':false}, async function(error, data, response) {
                            if (error) {
                                console.log(error);
                            } else {
                                console.log("Activity found: "+JSON.stringify(data));
                                if (data['type'] == 'Run' || data['type'] == 'TrailRun' || data['type'] == 'VirtualRun') {
                                    console.log('RUNNING LAST OFF DAY SCRIPT');
                                    await addConsecutiveDaysMessage(objectId);
                                }
                            }
                        });
                    } else {
                        console.log("No authentication data found for athlete with ID "+ownerId);
                    }
                }
            });
        }
    }
});

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
    if (code) {
        let payload = {
            "client_id":process.env.CLIENT_ID,
            "client_secret":process.env.CLIENT_SECRET,
            "code":code,
            "grant_type":"authorization_code"
        };
        try {
            let response = await axios.post('https://www.strava.com/api/v3/oauth/token', payload);
            var authData = {
                accessToken: response.data['access_token'],
                refreshToken: response.data['refresh_token'],
                expiresAt: response.data['expires_at'],
                athleteId: response.data['athlete']['id']
            }
            // add the authData to the database, or update the existing document with the new authData
            db.update({ athleteId: response.data['athlete']['id']}, authData, { upsert: true });
            console.log("Added authData to the database: "+ JSON.stringify(authData));
            strava_oauth.accessToken = response.data['access_token'];
            console.log("Authenticated successfully with response "+ JSON.stringify(response.data));
        } catch (error) {
            console.log("Error exchanging authentication tokens", error);
            res.status(400).send("Failed to authenticate with Strava.");
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