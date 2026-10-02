import { useEffect, type RefObject } from 'react'
import { insideDocks } from '@/state/inside'

// Меряет «причалы» капсул главы «Состав» — точки рядом с метками
// ингредиентов, куда сцена ставит капсулы (three/inside/InsideCapsules.tsx).
// Тот же принцип, что у слота банки (useSlotTracking): раскладку решает CSS,
// сцена читает готовые координаты.
//
// Координаты — относительно sticky-экрана главы: пока глава «прилипла», он
// стоит в (0, 0), и это координаты на экране. Перемерять нужно только при
// смене размеров (окно, шрифт, раскладка): при скролле положение меток
// внутри экрана не меняется.
//
// У каждой метки ([data-inside-tag]) внутри есть пустой блок-причал
// ([data-inside-dock]): его правый край — место капсулы, ширина — насколько
// текущая капсула выдвигается к банке.
export function useDockTracking(listRef: RefObject<HTMLElement | null>, frameRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const list = listRef.current
    const frame = frameRef.current
    if (!list || !frame) return

    const measure = () => {
      const origin = frame.getBoundingClientRect()
      list.querySelectorAll<HTMLElement>('[data-inside-tag]').forEach((tag, index) => {
        const dock = tag.querySelector<HTMLElement>('[data-inside-dock]')
        if (!dock) return
        const rect = dock.getBoundingClientRect()
        insideDocks[index] = {
          x: rect.right - origin.left,
          y: rect.top + rect.height / 2 - origin.top,
          reach: rect.width,
          tagX: tag.getBoundingClientRect().left - origin.left,
        }
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    observer.observe(frame)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      insideDocks.length = 0
    }
  }, [listRef, frameRef])
}
