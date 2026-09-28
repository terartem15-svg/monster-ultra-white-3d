import { useEffect, type RefObject } from 'react'
import type { SlotRect } from '@/state/motion'

// Меряет "слот" под 3D-банку и отдаёт его прямоугольник в общий store —
// сцена (three/CanRig.tsx) каждый кадр ставит композицию по этому слоту.
//
// Слот лежит внутри sticky-экрана главы, и мерить его нужно относительно
// этого экрана, а не окна: пока глава "прилипла", экран стоит в (0, 0), и
// координаты внутри него — это и есть координаты на экране. Так замер верен,
// даже если он случился, когда глава ещё ниже или уже выше экрана (загрузка
// страницы, поворот телефона посреди другой главы). Перемерять нужно только
// при изменении размеров — при скролле положение внутри экрана не меняется.
export function useSlotTracking(
  slotRef: RefObject<HTMLElement | null>,
  frameRef: RefObject<HTMLElement | null>,
  onMeasure: (rect: SlotRect) => void,
) {
  useEffect(() => {
    const slot = slotRef.current
    const frame = frameRef.current
    if (!slot || !frame) return

    const measure = () => {
      const rect = slot.getBoundingClientRect()
      const origin = frame.getBoundingClientRect()
      onMeasure({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    observer.observe(frame)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [slotRef, frameRef, onMeasure])
}
