import { useEffect, type RefObject } from 'react'
import { motion } from '@/state/motion'

// Меряет "слот" под 3D-банку и кладёт его прямоугольник в общий store —
// сцена (three/CanRig.tsx) каждый кадр ставит композицию по этому слоту.
// Слот лежит внутри sticky-блока, поэтому при скролле его положение на
// экране не меняется: перемерять нужно только при изменении размеров.
export function useSlotTracking(slotRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const slot = slotRef.current
    if (!slot) return

    const measure = () => {
      const rect = slot.getBoundingClientRect()
      motion.slot = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [slotRef])
}
