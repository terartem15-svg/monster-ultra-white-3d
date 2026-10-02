import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { NeutralToneMapping, type DirectionalLight } from 'three'
import { isSceneCovered, subscribeSceneCovered } from '@/state/sceneCover'
import { Backdrop } from './Backdrop'
import { CalloutTracker } from './CalloutTracker'
import { CanRig } from './CanRig'
import { Droplets } from './Droplets'
import { StudioEnvironment } from './StudioEnvironment'
import { SlicedCan } from './can/SlicedCan'
import { ColdVapor } from './coldAir/ColdVapor'
import { DiamondDust } from './coldAir/DiamondDust'
import { NightLights } from './coldAir/NightLights'
import { FrostGlass } from './final/FrostGlass'
import { IceCubes } from './ice/IceCubes'
import { InsideCapsules } from './inside/InsideCapsules'
import { LineupCans } from './lineup/LineupCans'
import { lineupLook } from './lineup/lineupLook'
import styles from './Scene.module.css'

// --- Камера и рендерер ---------------------------------------------------------

// Длиннофокусный "объектив" предметной съёмки: узкий угол почти не
// искажает банку. Камера смотрит вдоль -Z на начало координат, композиция
// стоит в плоскости z = 0 (раскладка — в CanRig.tsx).
const CAMERA = { position: [0, 0, 16] as [number, number, number], fov: 24, near: 0.1, far: 90 }

// Neutral tone mapping (Khronos PBR Neutral) почти не сдвигает оттенки:
// белая банка остаётся белой, а ледяной голубой — именно голубым.
const GL = { antialias: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' as const }

// Размер холста — только по изменению размеров, не по скроллу (см. Scene)
const RESIZE = { scroll: false }

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
    // Долгий кадр — не замер скорости, а пауза (сцена стояла под футером,
    // вкладка была скрыта): замер начинается заново
    if (delta > 0.5) {
      current.time = 0
      current.frames = 0
      return
    }
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

// Футер закрыл сцену целиком (state/sceneCover.ts) — кадры рисуются только
// по запросу (смена размера окна), пока он не начнёт уходить. Часы сцены при
// смене режима R3F обнуляет — время возвращаем, иначе всё, что движется от
// elapsedTime (парение банки, капли, небо), прыгнуло бы в начало. Пока
// сцена стоит, время тоже стоит: возвращаемся туда же, где ушли
function FrameGate() {
  const get = useThree((state) => state.get)

  useEffect(() => {
    const apply = () => {
      const { clock, frameloop, setFrameloop } = get()
      const next = isSceneCovered() ? 'demand' : 'always'
      if (frameloop === next) return
      const elapsed = clock.elapsedTime
      setFrameloop(next)
      clock.elapsedTime = elapsed
    }
    apply()
    return subscribeSceneCovered(apply)
  }, [get])
  return null
}

// Цветная подсветка коллекции: свет сбоку-сзади в цвет вкуса — по правому
// краю банки бежит цветной блик, лёд ловит цветные искры. На первом экране
// её сила ноль (lineup/lineupLook.ts), и картинка там прежняя. Свет есть в
// сцене с самого начала: иначе его появление перекомпилировало бы шейдеры
// всех материалов посреди скролла.
function LineupLight() {
  const lightRef = useRef<DirectionalLight>(null)
  useFrame(() => {
    const light = lightRef.current
    if (!light) return
    light.color.copy(lineupLook.rim)
    light.intensity = lineupLook.rimIntensity
  })
  return <directionalLight ref={lightRef} position={[4.5, 3, -2.5]} intensity={0} />
}

interface SceneProps {
  onReady: () => void
}

// Единственный canvas страницы: «прилипает» во весь экран под DOM-контентом
// всех глав и в конце уезжает вверх вместе с финальным экраном, когда на него
// наезжает футер (Scene.module.css). Кадр рисуется постоянно — сцена всё
// время в движении (парение, физика льда, капли), — пока футер не закроет её
// целиком (FrameGate).
//
// resize без scroll: R3F иначе перемеряет холст на каждый скролл, а когда он
// уезжает с футером — перерисовывает всё дерево сцены каждые 50 мс. Положение
// холста на странице сцене не нужно: события указателя она читает с окна
export function Scene({ onReady }: SceneProps) {
  // Если WebGL недоступен или что-то упало, прелоадер не должен висеть
  // вечно: страница откроется и без сцены — текст и навигация работают
  useEffect(() => {
    const timer = window.setTimeout(onReady, 9000)
    return () => window.clearTimeout(timer)
  }, [onReady])

  return (
    <div className={styles.canvasWrapper} aria-hidden="true">
      <div className={styles.canvasFrame}>
        <Canvas dpr={[1, MAX_DPR]} camera={CAMERA} gl={GL} resize={RESIZE}>
          <FrameGate />
          <AdaptiveResolution />
          <Suspense fallback={null}>
            <Backdrop />
            <StudioEnvironment />
            <LineupLight />
            <NightLights />
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
              stage={
                <>
                  <LineupCans />
                  {/* Воздух главы «Холод» — вокруг банки главы, в её масштабе */}
                  <ColdVapor />
                  <DiamondDust />
                </>
              }
            />
            {/* Капсулы «Состава» — в корне сцены: они летают между банкой и
                метками в DOM, то есть между двумя системами координат */}
            <InsideCapsules />
            {/* Морозное стекло финального экрана — тоже в корне: оно привязано
                к экрану, а не к банке */}
            <FrostGlass />
            <ReadySignal onReady={onReady} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}
