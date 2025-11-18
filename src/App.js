// src/App.js
import React from 'react';
import Gaming from './gaming/Gaming';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Gaming/>
      </div>
    </Router>
  );
}

export default App;