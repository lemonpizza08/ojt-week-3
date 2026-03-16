// Import React library
import React from 'react';
// Import ReactDOM to render React components in the browser
import ReactDOM from 'react-dom/client';
// Import the App component we created
import App from './App';

// Get the HTML element with id="root" and create a React root
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the App component inside React.StrictMode
root.render(
  // React.StrictMode helps catch potential problems in the app during development
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/*
  How It Works Together:
  
  1. index.js loads and imports React, ReactDOM, and the App component
     ↓
  2. ReactDOM.createRoot() finds the <div id="root"></div> in index.html
     ↓
  3. React.StrictMode wraps the App component for development checks
     ↓
  4. root.render() inserts the App component into the root div
     ↓
  5. App component loads and displays on the web page
     ↓
  6. useEffect in App runs → fetch("http://localhost:5000/hello")
     ↓
  7. Server responds with data from the database
     ↓
  8. Message displays on screen
*/