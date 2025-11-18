// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import Gaming from './gaming/Gaming';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Gaming />
  </React.StrictMode>
);