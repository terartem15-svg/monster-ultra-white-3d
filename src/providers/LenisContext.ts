import { createContext } from 'react'
import type Lenis from 'lenis'

// Контекст вынесен в отдельный файл от компонента-провайдера — если положить
// createContext и React-компонент в один файл, Vite/React Fast Refresh при
// правках теряет состояние компонента (правило react-refresh/only-export-components).
export const LenisContext = createContext<Lenis | null>(null)
