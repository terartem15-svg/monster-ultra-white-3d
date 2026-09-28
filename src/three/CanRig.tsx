import { useRef, type ReactNode } from 'react'
import { useFrame, type RootState } from '@react-three/fiber'
import { MathUtils, type Group, type PerspectiveCamera } from 'three'
import { PHASES } from '@/animations/scrollPhases'
import { motion } from '@/state/motion'
import { CAN_HEIGHT, CAN_RADIUS } from './can/canShape'
import { sceneState } from './sceneState'

// "Риг" композиции: ставит банку со льдом в слот, который отвела ей
// DOM-раскладка Hero, наклоняет её вслед за курсором и ведёт по скролл-сцене:
// сборка и оборот, подлёт в сцене деталей, возврат к финалу. Здесь же в
// начале каждого кадра из сырых motion.* считаются сглаженные значения
// sceneState, которые читают все объекты сцены.
//
// Иерархия групп — каждая отвечает за одно:
//   layout   — позиция и масштаб: по слоту, а в сцене деталей — крупно в центре
//   parallax — наклон за курсором
//   spin     — оборот банки на скролле и общее покачивание собранной банки
// Лёд и капли висят на parallax, а не на spin: банка крутится, лёд — нет.

// Габарит композиции в разобранном виде, ед. сцены: высота — банка с
// зазорами и запасом, ширина — банка с ближайшим льдом. Кубики по краям
// могут заходить под стеклянные карточки — это глубина, а не ошибка.
const COMPOSITION_WIDTH = 3.1
const COMPOSITION_HEIGHT = 4.75

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

// Общее покачивание собранной банки — то же "парение", что у кусков
const FLOAT_AMPLITUDE = 0.05
const FLOAT_SPEED = (Math.PI * 2) / 6.8

const phase = (value: number, [from, to]: readonly [number, number]) => MathUtils.smoothstep(value, from, to)

// Производные значения кадра: сглаженный скролл и фазы сцены
function updateSceneState(delta: number) {
  sceneState.scroll = MathUtils.damp(sceneState.scroll, motion.scroll, 7, delta)
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
}

// Слот из CSS-пикселей окна → позиция и масштаб в мировых единицах на
// плоскости z = 0 (камера смотрит вдоль -Z на начало координат)
function applyLayout(group: Group, state: RootState) {
  const { size } = state
  const camera = state.camera as PerspectiveCamera
  const slot = motion.slot.width > 0 ? motion.slot : { x: 0, y: 0, width: size.width, height: size.height }
  const viewHeight = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z
  const unitsPerPx = viewHeight / size.height

  const slotX = (slot.x + slot.width / 2 - size.width / 2) * unitsPerPx
  const slotY = -(slot.y + slot.height / 2 - size.height / 2) * unitsPerPx
  const fit = Math.min(
    (slot.height * unitsPerPx) / COMPOSITION_HEIGHT,
    (slot.width * unitsPerPx) / COMPOSITION_WIDTH,
  )
  // Собранная банка на скролле чуть подрастает — "герой" выходит вперёд
  const base = fit * (1 + 0.1 * sceneState.assemble)

  // Сцена деталей: насколько можно увеличить банку, чтобы она заняла
  // заданную долю экрана, и сдвиг к центру (чуть ниже середины — сверху шапка)
  const canHeightPx = (CAN_HEIGHT * base) / unitsPerPx
  const canWidthPx = (CAN_RADIUS * 2 * base) / unitsPerPx
  const zoom = MathUtils.clamp(
    Math.min((size.height * DETAIL_HEIGHT) / canHeightPx, (size.width * DETAIL_WIDTH) / canWidthPx),
    1,
    DETAIL_MAX_ZOOM,
  )
  const detail = sceneState.detail
  group.position.set(
    MathUtils.lerp(slotX, 0, detail),
    MathUtils.lerp(slotY, -size.height * 0.05 * unitsPerPx, detail),
    0,
  )
  group.scale.setScalar(base * MathUtils.lerp(1, zoom, detail))
}

interface CanRigProps {
  // Банка — крутится на скролле
  can: ReactNode
  // Лёд и капли — наклоняются вместе с банкой, но не крутятся
  surroundings: ReactNode
}

export function CanRig({ can, surroundings }: CanRigProps) {
  const layoutRef = useRef<Group>(null)
  const parallaxRef = useRef<Group>(null)
  const spinRef = useRef<Group>(null)

  // Приоритет -30: самый первый в кадре — остальные читают готовый sceneState
  useFrame((state, delta) => {
    updateSceneState(delta)
    const layout = layoutRef.current
    const parallax = parallaxRef.current
    const spin = spinRef.current
    if (!layout || !parallax || !spin) return

    applyLayout(layout, state)

    // Наклон за курсором через затухающее приближение — у движения есть
    // инерция, оно не "прилипает" к мыши
    const follow = motion.pointerActive && !motion.reducedMotion
    const targetYaw = follow ? motion.pointer.x * PARALLAX_YAW : 0
    const tilt = MathUtils.lerp(BASE_TILT, DETAIL_TILT, sceneState.detail)
    const targetPitch = tilt - (follow ? motion.pointer.y * PARALLAX_PITCH : 0)
    parallax.rotation.y = MathUtils.damp(parallax.rotation.y, targetYaw, 2.4, delta)
    parallax.rotation.x = MathUtils.damp(parallax.rotation.x, targetPitch, 2.4, delta)

    // Полный оборот за время сборки, а в сцене деталей — медленный доворот
    // из стороны в сторону, чтобы блики пробегали по металлу и каплям
    const scroll = sceneState.scroll
    const turn = phase(scroll, PHASES.spin)
    const drift = MathUtils.lerp(-0.25, 0.2, phase(scroll, [PHASES.detailIn[0], PHASES.detailOut[1]]))
    spin.rotation.y = turn * Math.PI * 2 + drift * sceneState.detail
    spin.position.y =
      Math.sin(state.clock.elapsedTime * FLOAT_SPEED) * FLOAT_AMPLITUDE * sceneState.assemble * sceneState.calm
  }, -30)

  return (
    <group ref={layoutRef}>
      <group ref={parallaxRef} rotation-x={BASE_TILT}>
        <group ref={spinRef}>{can}</group>
        {surroundings}
      </group>
    </group>
  )
}
