import { useCallback, useSyncExternalStore } from 'react'

// Совпадает ли медиазапрос — как useReducedMotion, только для любого запроса:
// значение верное уже на первом рендере и обновляется при смене (поворот,
// размер окна)
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
