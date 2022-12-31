# StravaRunStreak
https://stravarunstreak.onrender.com/

![logo192](https://user-images.githubusercontent.com/63806844/210122939-7eae035c-26e9-455d-8585-f1020b2e62e4.png)

## What?
Run Streak is an app that uses Strava's API to automatically track the number of consecutive days that a user has logged a run. Clicking [the link](https://stravarunstreak.onrender.com/) directs you to a page to authorize the app to access your runs and update your activities for you. Once you've clicked authorize, you're done! The next time you post a run, you will see your Run Streak generated at the end of your run's description. Click on the same link again to unsubscribe to this service.

## Why?
Running is all about consistency. Whether you are just getting into running as a New Year's resolution or you are a Division 1 cross-country runner, regular training is essential to any long-term improvement. Conversely, overtraining is a common issue at the higher levels of running, which can lead to stress injuries, fatigue, and mental blocks. Finding the right balance between training and recovering can make the difference for athletes across many skill levels.   

## How!
This app uses Node.Js with Express to make REST calls to Strava's API. Clicking "authorize" activates the Run Streak API endpoints for beginning the authorization process and subscribing to the webhook. The user's access token is stored in a [NeDB](https://github.com/louischatriot/nedb) datastore (a JavaScript database kept in-memory), alongside the athlete's ID, refresh token for refreshing the authentication once the access token expires, and time of token expiry. 

After that, creating an activity triggers the webhook endpoint of the app, which calculates the number of consecutive days of running before the activity was posted and appends that number to the activity's description.

## Author
Thomas Lingard
