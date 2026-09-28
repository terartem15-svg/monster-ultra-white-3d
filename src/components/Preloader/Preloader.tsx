import { useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/Logo/Logo'
import styles from './Preloader.module.css'

interface PreloaderProps {
  // Сцена готова: шрифты загружены, этикетка нарисована, шейдеры собраны
  ready: boolean
  // Прелоадер начал уходить — пора запускать вступление
  onReveal: () => void
  // Прелоадер полностью исчез — его можно размонтировать
  onDone: () => void
}

// Минимальное время показа: если сцена собралась мгновенно, прелоадер не
// должен мигнуть на кадр — это выглядит как сбой, а не как загрузка
const MIN_VISIBLE_MS = 900

// Экран загрузки: "иней" во весь экран, парящий коготь и тонкая линия
// прогресса. Прячет сборку сцены (компиляция шейдеров, отрисовка этикетки),
// чтобы вступление стартовало на готовой, не дёргающейся сцене.
export function Preloader({ ready, onReveal, onDone }: PreloaderProps) {
  const [leaving, setLeaving] = useState(false)
  const mountedAt = useRef(0)

  useEffect(() => {
    mountedAt.current = performance.now()
  }, [])

  useEffect(() => {
    if (!ready || leaving) return
    const elapsed = performance.now() - mountedAt.current
    const timer = window.setTimeout(
      () => {
        setLeaving(true)
        onReveal()
      },
      Math.max(0, MIN_VISIBLE_MS - elapsed),
    )
    return () => window.clearTimeout(timer)
  }, [ready, leaving, onReveal])

  return (
    <div
      className={styles.preloader}
      data-ready={ready}
      data-leaving={leaving}
      onTransitionEnd={(event) => {
        if (leaving && event.target === event.currentTarget && event.propertyName === 'opacity') onDone()
      }}
    >
      <div className={styles.mark}>
        <Logo clawOnly />
      </div>
      <div className={styles.bar} aria-hidden="true">
        <span className={styles.barFill} />
      </div>
      <p className="visually-hidden" role="status">
        {ready ? 'Loaded' : 'Loading…'}
      </p>
    </div>
  )
}
