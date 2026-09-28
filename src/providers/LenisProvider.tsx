import { useEffect, useState, type ReactNode } from 'react'
import Lenis from 'lenis'
import { LenisContext } from './LenisContext'
import { syncLenisWithScrollTrigger } from '@/animations/scrollSync'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface LenisProviderProps {
  children: ReactNode
}

// Единственный на всё приложение экземпляр Lenis (см. main.tsx): и DOM, и
// 3D-сцена двигаются от одного источника прогресса скролла через
// ScrollTrigger. При "уменьшить движение" инерционный скролл не создаётся —
// остаётся нативный, ScrollTrigger работает и с ним.
export function LenisProvider({ children }: LenisProviderProps) {
  const [lenis, setLenis] = useState<Lenis | null>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const instance = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - 2 ** (-10 * t)),
    })
    const cleanupSync = syncLenisWithScrollTrigger(instance)
    // Lenis — внешняя система: экземпляр нельзя создать раньше эффекта
    // (нужен смонтированный document), а потребителям контекста нужен
    // реальный объект, поэтому setState в эффекте здесь оправдан.
    // oxlint-disable-next-line react/set-state-in-effect
    setLenis(instance)

    return () => {
      cleanupSync()
      instance.destroy()
      setLenis(null)
    }
  }, [reducedMotion])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
