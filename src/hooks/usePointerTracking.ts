import { useEffect } from 'react'
import { motion } from '@/state/motion'

// Отслеживает указатель на уровне окна, а не canvas: 3D-сцена лежит под
// DOM-контентом, и события до canvas почти не доходят. Результат пишется в
// общий store (state/motion.ts), где его каждый кадр читает сцена: риг
// наклоняет композицию за курсором, а лёд считает по смещению курсора
// скорость толчка (three/ice/IceCubes.tsx).
export function usePointerTracking() {
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      motion.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      motion.pointer.y = -((event.clientY / window.innerHeight) * 2 - 1)
      // Наклон и толчки льда — только от мыши и пера: на тач-экране палец
      // скроллит страницу, а не "трогает" сцену
      motion.pointerActive = event.pointerType === 'mouse' || event.pointerType === 'pen'
    }

    // Указатель ушёл за окно — сцена плавно возвращается в нейтраль
    const onLeave = () => {
      motion.pointerActive = false
      motion.pointer.x = 0
      motion.pointer.y = 0
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])
}
