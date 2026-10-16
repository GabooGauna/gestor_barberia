import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

let storedTheme
try {
  storedTheme = localStorage.getItem('gestor-tema')
} catch {
  storedTheme = null
}
const savedTheme = ['light', 'dark', 'system'].includes(storedTheme) ? storedTheme : 'system'
const resolvedTheme = savedTheme === 'system'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : savedTheme

document.documentElement.dataset.theme = resolvedTheme
document.documentElement.dataset.themePreference = savedTheme
document.documentElement.style.colorScheme = resolvedTheme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
