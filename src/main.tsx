import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LenisProvider } from '@/providers/LenisProvider'
// Шрифты из референса, self-hosted через Fontsource (без внешнего CDN):
// Nunito — заголовки, Archivo — навигация и текст. У Archivo подключён файл
// с осью ширины (wdth): широкое начертание нужно этикетке банки и слову финала.
import '@fontsource-variable/nunito/wght.css'
import '@fontsource-variable/archivo/wdth.css'
import '@/styles/tokens.css'
import '@/styles/global.css'
import App from './App.tsx'

// LenisProvider — на самом верху: единственный экземпляр плавного скролла
// на всё приложение (см. providers/LenisProvider.tsx)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LenisProvider>
      <App />
    </LenisProvider>
  </StrictMode>,
)
