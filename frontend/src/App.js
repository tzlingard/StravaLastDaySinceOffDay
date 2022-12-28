import React, { useState, useEffect } from "react";
import logo from './app-icon.png';
import './App.css';

//TODO: Make client_ID an environment variable (hide from github)
function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          LAST OFF DAY
        </p>
        <a
          className="Connect to Strava"
          href={`https://www.strava.com/oauth/authorize?client_id=99078&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=read_all,activity:read_all,activity:read,activity:write#_=_`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Connect to Strava
        </a>
      </header>
    </div>
  );
}

export default App;
