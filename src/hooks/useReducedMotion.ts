import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// Системная настройка "уменьшить движение". Через useSyncExternalStore, а не
// useState+useEffect: значение верное уже на первом рендере и обновляется,
// если пользователь переключит настройку при открытой странице.
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
