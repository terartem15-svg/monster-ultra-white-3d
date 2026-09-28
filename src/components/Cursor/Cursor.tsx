import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import styles from './Cursor.module.css'

// Элементы, над которыми кольцо курсора увеличивается и подсвечивается
const INTERACTIVE = 'a, button, [data-cursor="hover"]'

// Кастомный курсор: круглое кольцо с тонкой обводкой, плавно догоняющее
// указатель, и маленькая точка точно под ним — точка даёт точность, кольцо —
// ощущение инерции. Над ссылками и кнопками кольцо растёт и наполняется
// ледяным цветом, при нажатии — чуть сжимается.
//
// Только для устройств с мышью (hover + fine pointer): на тач-экранах
// курсора нет вообще, и системный курсор там не прячется.
export function Cursor() {
  const rootRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const root = rootRef.current
    const ring = ringRef.current
    const dot = dotRef.current
    if (!root || !ring || !dot) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    document.documentElement.classList.add('has-custom-cursor')

    // quickTo — один переиспользуемый твин на ось вместо нового на каждое
    // событие мыши. При reduced motion кольцо следует без запаздывания.
    const lag = reducedMotion ? 0 : 0.42
    const ringX = gsap.quickTo(ring, 'x', { duration: lag, ease: 'power3.out' })
    const ringY = gsap.quickTo(ring, 'y', { duration: lag, ease: 'power3.out' })
    const dotX = gsap.quickTo(dot, 'x', { duration: 0.06, ease: 'none' })
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.06, ease: 'none' })

    let visible = false
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
      if (!visible) {
        // Первое появление — сразу в точке указателя, без "прилёта" из угла
        gsap.set([ring, dot], { x: event.clientX, y: event.clientY })
        root.dataset.visible = 'true'
        visible = true
      }
      ringX(event.clientX)
      ringY(event.clientY)
      dotX(event.clientX)
      dotY(event.clientY)
    }

    const onOver = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null
      root.dataset.hover = target ? 'true' : 'false'
    }
    const onDown = () => {
      root.dataset.pressed = 'true'
    }
    const onUp = () => {
      root.dataset.pressed = 'false'
    }
    const onLeave = () => {
      root.dataset.visible = 'false'
      visible = false
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerover', onOver, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      document.documentElement.classList.remove('has-custom-cursor')
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      gsap.killTweensOf([ring, dot])
    }
  }, [reducedMotion])

  return (
    <div ref={rootRef} className={styles.cursor} data-visible="false" aria-hidden="true">
      <div ref={ringRef} className={styles.follower}>
        <div className={styles.ring} />
      </div>
      <div ref={dotRef} className={styles.follower}>
        <div className={styles.dot} />
      </div>
    </div>
  )
}
