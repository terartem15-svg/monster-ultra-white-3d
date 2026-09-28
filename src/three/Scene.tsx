import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { NeutralToneMapping } from 'three'
import { Backdrop } from './Backdrop'
import { CalloutTracker } from './CalloutTracker'
import { CanRig } from './CanRig'
import { Droplets } from './Droplets'
import { StudioEnvironment } from './StudioEnvironment'
import { SlicedCan } from './can/SlicedCan'
import { IceCubes } from './ice/IceCubes'
import styles from './Scene.module.css'

// --- Камера и рендерер ---------------------------------------------------------

// Длиннофокусный "объектив" предметной съёмки: узкий угол почти не
// искажает банку. Камера смотрит вдоль -Z на начало координат, композиция
// стоит в плоскости z = 0 (раскладка — в CanRig.tsx).
const CAMERA = { position: [0, 0, 16] as [number, number, number], fov: 24, near: 0.1, far: 90 }

// Neutral tone mapping (Khronos PBR Neutral) почти не сдвигает оттенки:
// белая банка остаётся белой, а ледяной голубой — именно голубым.
const GL = { antialias: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' as const }

// Плотность пикселей: не выше 1.75 — на 3x-экранах это экономит больше
// половины работы без видимой разницы
const MAX_DPR = 1.75

// Адаптивное разрешение: если сцена два замера подряд (по 2 с) держит
// меньше ~42 FPS, плотность пикселей снижается ступенями до 1. На слабом
// ноутбуке картинка чуть мягче, зато движение остаётся плавным.
function AdaptiveResolution() {
  const setDpr = useThree((state) => state.setDpr)
  const initialDpr = useThree((state) => state.viewport.dpr)
  const sample = useRef({ time: 0, frames: 0, strikes: 0, dpr: 0 })

  useFrame((_, delta) => {
    const current = sample.current
    if (current.dpr === 0) current.dpr = initialDpr
    current.time += delta
    current.frames += 1
    if (current.time < 2) return
    const fps = current.frames / current.time
    current.time = 0
    current.frames = 0
    if (fps >= 42 || current.dpr <= 1) {
      current.strikes = 0
      return
    }
    current.strikes += 1
    if (current.strikes >= 2) {
      current.strikes = 0
      current.dpr = Math.max(1, current.dpr - 0.25)
      setDpr(current.dpr)
    }
  })
  return null
}

// Сообщает наружу, что сцена готова. Сначала все шейдеры собираются
// заранее и без блокировки страницы (compileAsync — параллельная
// компиляция, прелоадер при этом анимируется плавно), затем ждём два
// кадра — текстуры уже в видеопамяти, первый кадр вступления не дёрнется.
// Компонент стоит последним в Suspense: к моменту его эффекта окружение
// (StudioEnvironment) уже назначено, и шейдеры собираются сразу с ним.
function ReadySignal({ onReady }: { onReady: () => void }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const compiled = useRef(false)
  const frames = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    let cancelled = false
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) compiled.current = true
      })
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera])

  useFrame(() => {
    if (done.current || !compiled.current) return
    frames.current += 1
    if (frames.current >= 2) {
      done.current = true
      onReady()
    }
  })
  return null
}

interface SceneProps {
  onReady: () => void
}

// Единственный canvas страницы: зафиксирован во весь экран под DOM-контентом
// (Scene.module.css). Кадр рисуется постоянно — сцена всё время в движении
// (парение, физика льда, капли).
export function Scene({ onReady }: SceneProps) {
  // Если WebGL недоступен или что-то упало, прелоадер не должен висеть
  // вечно: страница откроется и без сцены — текст и навигация работают
  useEffect(() => {
    const timer = window.setTimeout(onReady, 9000)
    return () => window.clearTimeout(timer)
  }, [onReady])

  return (
    <div className={styles.canvasWrapper} aria-hidden="true">
      <Canvas dpr={[1, MAX_DPR]} camera={CAMERA} gl={GL}>
        <AdaptiveResolution />
        <Suspense fallback={null}>
          <Backdrop />
          <StudioEnvironment />
          <CanRig
            can={
              <>
                <SlicedCan />
                {/* Трекер выносок — в группе вращения банки: якоря крутятся с ней */}
                <CalloutTracker />
              </>
            }
            surroundings={
              <>
                <IceCubes />
                <Droplets />
              </>
            }
          />
          <ReadySignal onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  )
}
