
// Imports dependencies and sets up http server
const
  express = require('express'),
  bodyParser = require('body-parser'),
  path = require('path'),
  axios = require('axios'),
  StravaApiV3 = require('strava_api_v3'),
  // creates express http server
  app = express().use(bodyParser.json());
  require('dotenv').config();   

  var defaultClient = StravaApiV3.ApiClient.instance;
var expiresAt, refreshToken, clientId, clientSecret;

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
          var offDayDescription = "";
          var daysSinceLastOffDay = getDaysSinceLastOffDay(data);
          if (daysSinceLastOffDay == null) {
            offDayDescription = "No off days found recently. Consider taking a day to rest and recover!";
          } else {
            offDayDescription = daysSinceLastOffDay + " days of consecutive activity. ";
            if (daysSinceLastOffDay < 7) {
              offDayDescription += "Keep up the good work!"
            } else if (daysSinceLastOffDay >= 7 && daysSinceLastOffDay < 14) {
              offDayDescription += "Consider a rest day soon."
            } else if (daysSinceLastOffDay >=14 && daysSinceLastOffDay < 21) {
              offDayDescription += "Take some time to recover!"
            }
          }
          console.log(offDayDescription);
          activitiesApi.getActivityById(objectId, {'includeAllEfforts': true}, function(error, data, response) {
            if (error) {
                console.error(error);
            } else {
                console.log('getActivityByID called successfully.');
                var activityUpdate = {
                  'commute': data.commute,
                  'trainer': data.trainer,
                  'hide_from_home': data.hide_from_home,
                  'description': data.description+"\n\n"+offDayDescription,
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
  
function getDaysSinceLastOffDay(activities) {
    // Activities are sorted by start date, with the most recent first
    var lastDayWithoutActivity = null;
    const mostRecentActivityDate = activities[0]["startDate"];
    mostRecentActivityDate.setHours(0,0,0,0);
    const mostRecentActivityDateTime = activities[0]["startDate"].getTime();

    var nextActivityDate = activities[0]["startDate"];
    for (let i=1; i<activities.length; i++) {
    var activityDate = activities[i]["startDate"];
    activityDate.setHours(0,0,0,0);
    var dayBeforeNextActivity = nextActivityDate;
    dayBeforeNextActivity.setDate(nextActivityDate.getDate()-1);
    dayBeforeNextActivity.setHours(0,0,0,0);
    // if the day before the most recent activity is more recent than the current (earlier) activity day
    // ie. if the activity is more than a day before the next activity
    if (activityDate.getTime() < dayBeforeNextActivity.getTime()) {
        lastDayWithoutActivity = dayBeforeNextActivity;
        var timeSinceLastOffDay = mostRecentActivityDateTime - lastDayWithoutActivity.getTime();
        return timeSinceLastOffDay / (1000 * 3600 * 24); // number of days since last off day
    } else {
        nextActivityDate = activityDate;
    }
    }
    return null;
}

// Sets server port and logs message on success
app.listen(process.env.PORT || 80, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook
app.post('/webhook', async (req, res) => {
    console.log("webhook event received!", req.query, req.body);
    res.status(200).send('EVENT_RECEIVED');
    // Parses the query params
    let object_type = req.body['object_type'];
    let object_id = req.body['object_id'];
    let aspect_type = req.body['aspect_type'];

    // Checks if the correct event data fields are present
    if (object_type && object_id && aspect_type) {
        // Only trigger update when creating an activity
        if (object_type === 'activity' && aspect_type === 'create') {  
            await addConsecutiveDaysMessage(object_id);
            console.log('RUNNING LAST OFF DAY SCRIPT');
        }
    }
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {
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

  //TODO: front-end design, deploy to Heroku
  app.get('/auth', async (req, res) => {
    console.log("Exchange token request received!", req.query, req.body);
    let code = req.query['code'];
    if (code) {
        let payload = {
            "client_id":process.env.CLIENT_ID,
            "client_secret":process.env.CLIENT_SECRET,
            "code":code,
            "grant_type":"authorization_code"
        };
        let response = await axios.post('https://www.strava.com/api/v3/oauth/token', payload);
        strava_oauth.accessToken = response.data['access_token'];
        expiresAt = response.data['expires_at'];
        refreshToken = response.data['refresh_token'];
        console.log("Authenticated successfully with response "+ JSON.stringify(response.data));
        response = await axios.get(process.env.DOMAIN_NAME+"/subscribe");
        res.status(200).send(response.data);
        } else {
        res.sendStatus(400);
    }
  });

app.get('/subscribe', async (req, res) => {
    payload = {
        "client_id":process.env.CLIENT_ID,
        "client_secret":process.env.CLIENT_SECRET,
        "callback_url": process.env.DOMAIN_NAME+"/webhook",
        "verify_token": "STRAVA"
    };
    console.log("Calling POST https://www.strava.com/api/v3/push_subscriptions with payload: "+JSON.stringify(payload));
    try {
        let response = await axios.post('https://www.strava.com/api/v3/push_subscriptions', payload);
        let subscriptionId = response.data['id'];
        if (subscriptionId) {
            console.log("Successfully subscribed to webhook.");
            res.status(200).send("Successfully subscribed to Run Streak. You may unsubscribe by following the same link or revoking access on the Strava -> My Apps page.");
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
                    res.status(200).send("You are now unsubscribed to Run Streak.");
                }
            }
        }
    }
    });