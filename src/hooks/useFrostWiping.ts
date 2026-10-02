import { useEffect } from 'react'
import { frost, frostBrushRadius, refreshFrostCursor, wipeFrost } from '@/state/frost'

// Указатель протирает иней финального экрана: мышь и перо — просто проводя
// курсором (кольцо курсора в этот момент размером с кисть), палец — любым
// касанием, в том числе пока листает страницу. Слушатели — на окне, как у
// usePointerTracking: canvas лежит под DOM, и события до него не доходят.
//
// Пока открыто мобильное меню (контент под ним inert), касания и курсор
// заняты меню — иней за панелью не протирается.
//
// Штрих — отрезками между соседними событиями одного указателя, иначе
// быстрый взмах оставил бы цепочку пятен. Пауза дольше STROKE_GAP — новый
// штрих: курсор, вернувшийся с другого конца экрана, не прочертит линию через
// весь иней.
const STROKE_GAP = 120

interface LastPoint {
  x: number
  y: number
  time: number
}

export function useFrostWiping() {
  useEffect(() => {
    const last = new Map<string, LastPoint>()

    const main = document.getElementById('main')
    const stroke = (id: string, x: number, y: number, kind: 'pointer' | 'touch') => {
      if (!frost.wipeable || frost.phase !== 'frozen' || main?.inert) {
        last.delete(id)
        return
      }
      const now = performance.now()
      const previous = last.get(id)
      const radius = frostBrushRadius(kind)
      if (previous && now - previous.time < STROKE_GAP) wipeFrost(previous.x, previous.y, x, y, radius)
      else wipeFrost(x, y, x, y, radius)
      last.set(id, { x, y, time: now })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
      stroke(`p${event.pointerId}`, event.clientX, event.clientY, 'pointer')
    }
    const onTouch = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) stroke(`t${touch.identifier}`, touch.clientX, touch.clientY, 'touch')
    }
    const onTouchEnd = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) last.delete(`t${touch.identifier}`)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('resize', refreshFrostCursor)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('resize', refreshFrostCursor)
    }
  }, [])
}
