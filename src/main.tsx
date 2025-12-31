import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppNewLayout from './AppNewLayout.tsx'
import { ThemeProvider } from './components/ui/theme-provider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AppNewLayout />
    </ThemeProvider>
  </StrictMode>,
)
