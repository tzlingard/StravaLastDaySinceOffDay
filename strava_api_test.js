var StravaApiV3 = require('strava_api_v3');
var defaultClient = StravaApiV3.ApiClient.instance;

// Configure OAuth2 access token for authorization: strava_oauth
var strava_oauth = defaultClient.authentications['strava_oauth'];
strava_oauth.accessToken = "YOUR ACCESS TOKEN" //TODO: replace this


var activitiesApi = new StravaApiV3.ActivitiesApi()

var opts = {
    'after': Date.now-(1000*60*60*24*365) // Activities in the past year
}

activitiesApi.getLoggedInAthleteActivities(opts, function(error, data, response) {
    if (error) {
      console.error(error);
    } else {
      console.log('API called successfully. Returned data: ' + data);
      const activities = response.data;
      const daysSinceLastOffDay = getDaysSinceLastOffDay(activities);
      const lastActivity = activities[activities.length-1];
      activitiesApi.getActivityById(lastActivity.id, {'includeAllEfforts': true}, function(error, data, response) {
        if (error) {
            console.error(error);
        } else {
            console.log('API called successfully. Returned data: ' + data);
            var opts = {
                'body': response.description + "\n\nDays since last off day: "+daysSinceLastOffDay
              }
            activitiesApi.updateActivityById(lastActivity.id, opts, function(error, data, response) {
                if (error) {
                    console.error(error);
                } else {
                    console.log('API called successfully. Returned data: ' + data);
                }
            })
        }
      });
    }
  }
);

function getDaysSinceLastOffDay(activities) {
    // Sort the activities by start date, in ascending order
    activities.sort((a, b) => a.start_date.localeCompare(b.start_date));
    let daysSinceLastOffDay = 0;
    let lastDayWithoutActivity = new Date();
    let prevActivityDate = new Date(activities.shift().start_date);
    for (activity in activities) {
        let activityDate = new Date(activity.start_date);
        activityDate.setDate(activityDate.getDate());
        // the day after the day of the previous activity
        let nextDay = prevActivityDate.setDate(prevActivityDate.getDate()+1);
        // if activityDate is over a day later than prevActivityDate
        if (activityDate.getTime() > nextDay.getTime()) {
            lastDayWithoutActivity = activityDate.setDate(activityDate.getDate()-1);
            daysSinceLastOffDay = Date.now() - lastDayWithoutActivity;
        }
    }
    return daysSinceLastOffDay;
}