import { useCallback, useEffect, useRef, useState } from 'react'
import { Cursor } from '@/components/Cursor/Cursor'
import { Header } from '@/components/Header/Header'
import { Preloader } from '@/components/Preloader/Preloader'
import { playIntro } from '@/animations/intro'
import { useLenis } from '@/hooks/useLenis'
import { usePointerTracking } from '@/hooks/usePointerTracking'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Hero } from '@/sections/Hero/Hero'
import { motion } from '@/state/motion'
import { Scene } from '@/three/Scene'
import styles from './App.module.css'

// Композиция страницы: фиксированный 3D-canvas в фоне (three/Scene.tsx),
// поверх — шапка и первый экран в обычном потоке документа, над всем —
// прелоадер и кастомный курсор.
//
// Порядок запуска: прелоадер держится, пока сцена не соберётся (шрифты,
// этикетка банки, шейдеры); затем он растворяется, стартует вступление
// (animations/intro.ts), и только после него включается скролл — чтобы
// никто не начал собирать банку, пока она ещё всплывает.
function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const lenis = useLenis()
  const reducedMotion = useReducedMotion()
  const [sceneReady, setSceneReady] = useState(false)
  const [preloaderDone, setPreloaderDone] = useState(false)
  const [introDone, setIntroDone] = useState(false)

  usePointerTracking()

  useEffect(() => {
    motion.reducedMotion = reducedMotion
  }, [reducedMotion])

  // Каждый заход начинается с первого экрана: браузер не восстанавливает
  // прежнюю прокрутку, иначе вступление сыграло бы в середине скролл-сцены
  useEffect(() => {
    history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (!lenis) return
    if (introDone) lenis.start()
    else lenis.stop()
  }, [lenis, introDone])

  const handleSceneReady = useCallback(() => setSceneReady(true), [])
  const handlePreloaderDone = useCallback(() => setPreloaderDone(true), [])

  const handleReveal = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const timeline = playIntro(root, motion.reducedMotion)
    // Скролл открывается чуть раньше конца вступления — хвост анимации
    // (подсказка скролла) не должен держать пользователя
    timeline.call(() => setIntroDone(true), undefined, Math.min(timeline.duration(), 1.9))
  }, [])

  // Пока висит прелоадер, контент под ним недоступен и для клавиатуры
  const hidden = !preloaderDone

  return (
    <div ref={rootRef} className={styles.page}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <Scene onReady={handleSceneReady} />
      <div className={styles.chrome} inert={hidden}>
        <Header />
      </div>
      <main id="main" className={styles.main} tabIndex={-1} inert={hidden}>
        <Hero />
      </main>
      <Cursor />
      {!preloaderDone && <Preloader ready={sceneReady} onReveal={handleReveal} onDone={handlePreloaderDone} />}
    </div>
  )
}

export default App
