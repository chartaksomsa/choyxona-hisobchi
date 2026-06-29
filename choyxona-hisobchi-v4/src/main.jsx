import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyTheme, getStoredTheme, watchSystemTheme } from './theme.js'

// Theme'ni darhol qo'llash (FOUC yo'qligi uchun)
applyTheme(getStoredTheme());
watchSystemTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
