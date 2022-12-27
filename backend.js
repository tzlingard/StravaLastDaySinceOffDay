var StravaApiV3 = require('strava_api_v3');
var defaultClient = StravaApiV3.ApiClient.instance;

// Configure OAuth2 access token for authorization: strava_oauth
var strava_oauth = defaultClient.authentications['strava_oauth'];
strava_oauth.accessToken = "a789cd8c43b56942d7d8a7e863178b5534beaa7e";

var activitiesApi = new StravaApiV3.ActivitiesApi(defaultClient);

addConsecutiveDaysMessage = async function(objectId) {
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
              console.log('getActivityByID called successfully. Returned data: ' + data);
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
                      console.log('updateActivityByID called successfully. Returned data: ' + data);
                  }
              })
          }
        });
      }
    }
  );
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