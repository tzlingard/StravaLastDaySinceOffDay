import React from "react";
import logo from './app-icon.png';
import './App.css';

function App() {
  var redirectUrl = "https://main.d3fu3r4798sqcd.amplifyapp.com";
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          RUN STREAK
        </p>
        <p className="App-subtext">
          A Strava app by Thomas Lingard
        </p>
        <a
          className="Connect to Strava"
          href={`https://www.strava.com/oauth/authorize?client_id=99078&response_type=code&redirect_uri=${redirectUrl}/auth&approval_prompt=force&scope=read_all,activity:read_all,activity:read,activity:write#_=_`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Connect to Strava
        </a>
        <h1 className="App-description">
      <p>Click "Connect to Strava" to track your consecutive days of running! Your streak will be automatically appended to the description of each of your runs logged on Strava. You may disable this feature at any time by clicking the same button again. </p>
      </h1>
      </header>
    </div>
  );
}

export default App;
