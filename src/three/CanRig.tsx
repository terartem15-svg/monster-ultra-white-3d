import { useRef, type ReactNode } from 'react'
import { useFrame, type RootState } from '@react-three/fiber'
import { MathUtils, type Group, type PerspectiveCamera } from 'three'
import { LINEUP, LINEUP_BREAKPOINTS, PHASES, lineupState, type LineupState } from '@/animations/scrollPhases'
import { FLAVORS } from '@/content/flavors'
import { motion, type SlotRect } from '@/state/motion'
import { CAN_HEIGHT, CAN_RADIUS } from './can/canShape'
import { FLOAT_AMPLITUDE, FLOAT_SPEED } from './float'
import { carouselPose, createPose, holdTurn } from './lineup/carousel'
import { updateLineupLook } from './lineup/lineupLook'
import { sceneState } from './sceneState'

// "Риг" композиции: ставит банку со льдом в слот, который отвела ей
// DOM-раскладка, наклоняет её вслед за курсором и ведёт по скроллу: в
// первом экране — сборка и оборот, подлёт в сцене деталей, возврат к финалу;
// в коллекции — переезд в слот главы, а потом эта же банка (Ultra White)
// становится первой в очереди вкусов и улетает, уступая место следующей.
// Здесь же в начале каждого кадра из сырых motion.* считаются сглаженные
// значения sceneState, которые читают все объекты сцены.
//
// Иерархия групп — каждая отвечает за одно:
//   layout   — позиция и масштаб: по слоту, в сцене деталей — крупно в центре
//   parallax — наклон за курсором
//   carousel — место банки первого экрана в очереди коллекции
//   spin     — оборот банки на скролле и общее покачивание собранной банки
// Лёд и капли висят на parallax, а не на spin: банка крутится, лёд — нет.
// Остальные банки коллекции (stage) висят прямо на layout и наклон
// повторяют сами (lineup/LineupCans.tsx).

// Габарит композиции в разобранном виде, ед. сцены: высота — банка с
// зазорами и запасом, ширина — банка с ближайшим льдом. Кубики по краям
// могут заходить под стеклянные карточки — это глубина, а не ошибка.
const COMPOSITION_WIDTH = 3.1
const COMPOSITION_HEIGHT = 4.75
// В коллекции банка всегда собрана, а в раскладке "столбиком" (телефон,
// планшет) слот невысокий — там композицию вписываем плотнее, иначе банка
// вышла бы мелкой. В десктопной сетке — как в первом экране: слоты глав
// совпадают, и банка на стыке не меняет размер
const LINEUP_STACKED_HEIGHT = 4.1
// Собранная банка чуть крупнее разобранной — "герой" выходит вперёд
const ASSEMBLED_GROWTH = 0.1

// Наклон к камере: чуть сверху — видны верхние грани срезов и крышка.
// В сцене деталей камера смотрит сверху сильнее — показать крышку.
const BASE_TILT = 0.1
const DETAIL_TILT = 0.3
// Насколько композиция поворачивается за курсором (рад)
const PARALLAX_YAW = 0.2
const PARALLAX_PITCH = 0.08

// Сцена деталей: банка занимает до 70% высоты экрана, но не шире 30%
// ширины — по бокам остаётся место под подписи, сверху — под крышку
const DETAIL_HEIGHT = 0.7
const DETAIL_WIDTH = 0.3
const DETAIL_MAX_ZOOM = 1.6

const phase = (value: number, [from, to]: readonly [number, number]) => MathUtils.smoothstep(value, from, to)

interface SlotFit {
  x: number
  y: number
  fit: number
}

// Временные объекты кадра
const frame = {
  pose: createPose(),
  fallbackSlot: { x: 0, y: 0, width: 0, height: 0 } as SlotRect,
  hero: { x: 0, y: 0, fit: 1 } as SlotFit,
  lineup: { x: 0, y: 0, fit: 1 } as SlotFit,
  lineupState: { enter: 0, position: 0, raw: 0 } as LineupState,
}

// Производные значения кадра: сглаженный скролл и фазы обеих глав
// Сглаживание скролла — только когда движение разрешено. При "уменьшить
// движение" сцена стоит ровно там, куда прокрутили: мгновенный переход из
// меню не должен "пролистывать" по пути все банки и цвета
const followScroll = (current: number, target: number, delta: number) =>
  motion.reducedMotion ? target : MathUtils.damp(current, target, 7, delta)
// Без движения переезды случаются разом на середине участка
const snap = (value: number) => (value >= 0.5 ? 1 : 0)

function updateSceneState(delta: number, width: number) {
  const reduced = motion.reducedMotion
  sceneState.scroll = followScroll(sceneState.scroll, motion.scroll, delta)
  sceneState.intro = motion.intro
  const scroll = sceneState.scroll
  // smoothstep уже даёт мягкий разгон и торможение — банка откликается
  // на скролл сразу, без "мёртвой зоны" в начале
  sceneState.assemble = phase(scroll, PHASES.assemble)
  sceneState.spread = phase(scroll, PHASES.spread)
  sceneState.detail = phase(scroll, PHASES.detailIn) * (1 - phase(scroll, PHASES.detailOut))
  // Движение затихает по мере сборки банки, а при "уменьшить движение"
  // декоративное парение останавливается совсем
  sceneState.calm = motion.reducedMotion ? 0 : 1 - 0.5 * sceneState.assemble

  // Коллекция. При "уменьшить движение" банки не летают: переезд и смена
  // банки случаются разом на середине участка, а цвет и слова всё равно
  // сменяются плавно — это не движение, а перетекание цвета
  sceneState.lineup = followScroll(sceneState.lineup, motion.lineup, delta)
  const lineup = lineupState(sceneState.lineup, motion.lineupLayout, FLAVORS.length, frame.lineupState)
  sceneState.lineupEnter = lineup.enter
  sceneState.stageIn = reduced ? snap(lineup.enter) : phase(lineup.enter, LINEUP.handoff.stage)
  sceneState.queueIn = reduced ? snap(lineup.enter) : phase(lineup.enter, LINEUP.handoff.queue)
  sceneState.flavor = reduced ? Math.round(lineup.position) : lineup.position
  sceneState.flavorLook = lineup.position
  sceneState.flavorRaw = lineup.raw
  sceneState.stacked = width < LINEUP_BREAKPOINTS.stacked
  updateLineupLook()
}

// Слот из CSS-пикселей окна → центр в мировых единицах на плоскости z = 0
// (камера смотрит вдоль -Z на начало координат) и масштаб, при котором
// композиция вписывается в слот
function fitSlot(out: SlotFit, slot: SlotRect, width: number, height: number, unitsPerPx: number, compositionHeight: number) {
  out.x = (slot.x + slot.width / 2 - width / 2) * unitsPerPx
  out.y = -(slot.y + slot.height / 2 - height / 2) * unitsPerPx
  out.fit = Math.min((slot.height * unitsPerPx) / compositionHeight, (slot.width * unitsPerPx) / COMPOSITION_WIDTH)
  return out
}

function applyLayout(group: Group, state: RootState) {
  const { width, height } = state.size
  const camera = state.camera as PerspectiveCamera
  const fallback = frame.fallbackSlot
  fallback.width = width
  fallback.height = height
  const heroSlot = motion.slot.width > 0 ? motion.slot : fallback
  const lineupSlot = motion.lineupSlot.width > 0 ? motion.lineupSlot : heroSlot
  const viewHeight = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z
  const unitsPerPx = viewHeight / height

  // Первый экран. Собранная банка на скролле чуть подрастает
  const hero = fitSlot(frame.hero, heroSlot, width, height, unitsPerPx, COMPOSITION_HEIGHT)
  const base = hero.fit * (1 + ASSEMBLED_GROWTH * sceneState.assemble)

  // Сцена деталей: насколько можно увеличить банку, чтобы она заняла
  // заданную долю экрана, и сдвиг к центру (чуть ниже середины — сверху шапка)
  const canHeightPx = (CAN_HEIGHT * base) / unitsPerPx
  const canWidthPx = (CAN_RADIUS * 2 * base) / unitsPerPx
  const zoom = MathUtils.clamp(
    Math.min((height * DETAIL_HEIGHT) / canHeightPx, (width * DETAIL_WIDTH) / canWidthPx),
    1,
    DETAIL_MAX_ZOOM,
  )
  const detail = sceneState.detail
  const heroX = MathUtils.lerp(hero.x, 0, detail)
  const heroY = MathUtils.lerp(hero.y, -height * 0.05 * unitsPerPx, detail)
  const heroScale = base * MathUtils.lerp(1, zoom, detail)

  // Коллекция: банка собрана, композиция вписывается в слот главы. На
  // десктопе слоты совпадают, и переезда не видно; на телефоне банка
  // плавно поднимается над плашкой и чуть подрастает
  const lineup = fitSlot(frame.lineup, lineupSlot, width, height, unitsPerPx, sceneState.stacked ? LINEUP_STACKED_HEIGHT : COMPOSITION_HEIGHT)
  const stageIn = sceneState.stageIn
  group.position.set(MathUtils.lerp(heroX, lineup.x, stageIn), MathUtils.lerp(heroY, lineup.y, stageIn), 0)
  group.scale.setScalar(MathUtils.lerp(heroScale, lineup.fit * (1 + ASSEMBLED_GROWTH), stageIn))

  // Прямоугольник сцены на экране — по нему фон ставит слово за банкой
  const stage = sceneState.stage
  stage.x = MathUtils.lerp(heroSlot.x, lineupSlot.x, stageIn)
  stage.y = MathUtils.lerp(heroSlot.y, lineupSlot.y, stageIn)
  stage.width = MathUtils.lerp(heroSlot.width, lineupSlot.width, stageIn)
  stage.height = MathUtils.lerp(heroSlot.height, lineupSlot.height, stageIn)
}

interface CanRigProps {
  // Банка первого экрана — крутится на скролле
  can: ReactNode
  // Лёд и капли — наклоняются вместе с банкой, но не крутятся
  surroundings: ReactNode
  // Остальные банки коллекции — на общей раскладке, наклон считают сами
  stage?: ReactNode
}

export function CanRig({ can, surroundings, stage }: CanRigProps) {
  const layoutRef = useRef<Group>(null)
  const parallaxRef = useRef<Group>(null)
  const carouselRef = useRef<Group>(null)
  const spinRef = useRef<Group>(null)

  // Приоритет -30: самый первый в кадре — остальные читают готовый sceneState
  useFrame((state, delta) => {
    updateSceneState(delta, state.size.width)
    const layout = layoutRef.current
    const parallax = parallaxRef.current
    const carousel = carouselRef.current
    const spin = spinRef.current
    if (!layout || !parallax || !carousel || !spin) return

    applyLayout(layout, state)

    // Наклон за курсором через затухающее приближение — у движения есть
    // инерция, оно не "прилипает" к мыши
    const follow = motion.pointerActive && !motion.reducedMotion
    const targetYaw = follow ? motion.pointer.x * PARALLAX_YAW : 0
    const tilt = MathUtils.lerp(BASE_TILT, DETAIL_TILT, sceneState.detail)
    const targetPitch = tilt - (follow ? motion.pointer.y * PARALLAX_PITCH : 0)
    parallax.rotation.y = MathUtils.damp(parallax.rotation.y, targetYaw, 2.4, delta)
    parallax.rotation.x = MathUtils.damp(parallax.rotation.x, targetPitch, 2.4, delta)
    sceneState.tiltX = parallax.rotation.x
    sceneState.tiltY = parallax.rotation.y

    // Место в очереди коллекции: банка первого экрана — вкус номер 0.
    // Улетела за кадр — выключаем, чтобы не тратить на неё кадр
    const pose = carouselPose(-sceneState.flavor, sceneState.stacked, frame.pose)
    carousel.visible = pose.visible
    sceneState.heroCanVisible = pose.visible
    carousel.position.set(pose.x, pose.y, pose.z)
    carousel.rotation.set(pose.rotX, pose.rotY, pose.rotZ)

    // Полный оборот за время сборки, а в сцене деталей — медленный доворот
    // из стороны в сторону, чтобы блики пробегали по металлу и каплям; в
    // коллекции — тот же медленный доворот под скроллом, что у всех банок
    const scroll = sceneState.scroll
    const turn = phase(scroll, PHASES.spin)
    const drift = MathUtils.lerp(-0.25, 0.2, phase(scroll, [PHASES.detailIn[0], PHASES.detailOut[1]]))
    const hold = motion.reducedMotion ? 0 : holdTurn(sceneState.flavorRaw, 0) * sceneState.stageIn
    spin.rotation.y = turn * Math.PI * 2 + drift * sceneState.detail + hold
    spin.position.y =
      Math.sin(state.clock.elapsedTime * FLOAT_SPEED) * FLOAT_AMPLITUDE * sceneState.assemble * sceneState.calm
  }, -30)

  return (
    <group ref={layoutRef}>
      <group ref={parallaxRef} rotation-x={BASE_TILT}>
        <group ref={carouselRef}>
          <group ref={spinRef}>{can}</group>
        </group>
        {surroundings}
      </group>
      {stage}
    </group>
  )
}
