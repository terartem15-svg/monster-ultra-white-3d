import { useContext } from 'react'
import { LenisContext } from '@/providers/LenisContext'

// Достаёт текущий экземпляр Lenis из контекста: App останавливает скролл на
// время прелоадера и вступления и включает обратно, когда сцена готова.
// null — Lenis не создан (reduced motion: остаётся нативный скролл).
export function useLenis() {
  return useContext(LenisContext)
}
