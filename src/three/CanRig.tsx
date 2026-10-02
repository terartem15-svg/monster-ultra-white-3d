import { useRef, type ReactNode } from 'react'
import { useFrame, type RootState } from '@react-three/fiber'
import { MathUtils, type Group, type PerspectiveCamera } from 'three'
import {
  COLD,
  FINAL,
  INSIDE,
  LINEUP,
  LINEUP_BREAKPOINTS,
  PHASES,
  coldState,
  coldTemperature,
  finalState,
  insideState,
  isLowScreen,
  lineupState,
  type ColdState,
  type FinalState,
  type InsideState,
  type LineupState,
} from '@/animations/scrollPhases'
import { COLD_PHYSICS, COLD_STOPS, COLD_TEMPERATURES } from '@/content/cold'
import { FLAVORS } from '@/content/flavors'
import { INGREDIENTS, INSIDE_STOPS } from '@/content/inside'
import { frostSpin } from '@/state/frost'
import { motion, type SlotRect } from '@/state/motion'
import { CAN_HEIGHT, CAN_RADIUS } from './can/canShape'
import { updateColdSurface } from './can/cold/coldSurface'
import { setCanGlass } from './can/glass'
import { FLOAT_AMPLITUDE, FLOAT_SPEED } from './float'
import { carouselPose, createPose, holdTurn } from './lineup/carousel'
import { updateLineupLook } from './lineup/lineupLook'
import { sceneState } from './sceneState'

// "Риг" композиции: ставит банку со льдом в слот, который отвела ей
// DOM-раскладка, наклоняет её вслед за курсором и ведёт по скроллу: в
// первом экране — сборка и оборот, подлёт в сцене деталей, возврат к финалу;
// в коллекции — переезд в слот главы, а потом эта же банка (Ultra White)
// становится первой в очереди вкусов и улетает, уступая место следующей;
// в «Холоде» — переезд в слот главы, крупнее, чтобы были видны капли и иней;
// в «Составе» синяя банка улетает, а эта возвращается из глубины, как банка
// очереди, встаёт в слот главы и становится стеклянной; на финальном экране
// она снова в центре, лёд возвращается к ней, а когда иней на стекле разбит —
// банка делает оборот.
// Здесь же в начале каждого кадра из сырых motion.* считаются сглаженные
// значения sceneState, которые читают все объекты сцены, и состояние
// поверхности банки (сухая / в каплях / в инее).
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
// В «Холоде» композиция вписывается ещё плотнее: банка на стыке подрастает,
// как будто камера подходит ближе, — на ней теперь главное, капли и иней
const COLD_COMPOSITION_HEIGHT = 4.5
const COLD_STACKED_HEIGHT = 3.9
// В «Составе» банка, наоборот, чуть мельче: над ней нужен воздух — оттуда
// поднимаются капсулы. По ширине — только сама банка с запасом: льда рядом
// нет, а капсулы и метки стоят вне слота (Inside.module.css)
const INSIDE_COMPOSITION_HEIGHT = 5.1
const INSIDE_STACKED_HEIGHT = 4.3
const INSIDE_COMPOSITION_WIDTH = 1.9
// На финальном экране — снова банка со льдом, как в коллекции: на десктопе
// слот в центре той же ширины, на телефоне банка над панелями
const FINAL_STACKED_HEIGHT = 4.2
// Собранная банка чуть крупнее разобранной — "герой" выходит вперёд
const ASSEMBLED_GROWTH = 0.1
// Медленный доворот банки за всю главу «Холод», рад: блики скользят по
// каплям и граням инея, и даже на остановке сцена отвечает на скролл
const COLD_TURN = -0.45
// В «Составе» банка за главу доворачивается от +INSIDE_TURN до −INSIDE_TURN
const INSIDE_TURN = 0.2
// Откуда возвращается банка Ultra White: место в очереди у самой границы
// видимости (lineup/carousel.ts) — из глубины справа, как банки коллекции
const ENCORE_FROM = 2.9
// Банка «только из холодильника», °C — к ней возвращается температура, когда
// «Холод» позади
const FRIDGE = 2
// Температура, при которой в главе «Холод» холодно «на полную»: сияние,
// морозный пар и ледяная пыль в полную силу, °C
const CHILL_FULL = -4
// Доли стыка «Состава», за которые гаснут морозный пар и ледяная пыль: до
// того как синяя банка начнёт улетать (INSIDE.handoff.swap)
const COLD_AIR_OUT: [number, number] = [0, 0.1]

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
  cold: { x: 0, y: 0, fit: 1 } as SlotFit,
  inside: { x: 0, y: 0, fit: 1 } as SlotFit,
  final: { x: 0, y: 0, fit: 1 } as SlotFit,
  lineupState: { enter: 0, position: 0, raw: 0 } as LineupState,
  coldState: { enter: 0, position: 0, raw: 0 } as ColdState,
  insideState: { enter: 0, position: 0, raw: 0 } as InsideState,
  finalState: { enter: 0, position: 0, raw: 0 } as FinalState,
}

// Производные значения кадра: сглаженный скролл и фазы всех глав
// Сглаживание скролла — только когда движение разрешено. При "уменьшить
// движение" сцена стоит ровно там, куда прокрутили: мгновенный переход из
// меню не должен "пролистывать" по пути все банки и цвета
const followScroll = (current: number, target: number, delta: number) =>
  motion.reducedMotion ? target : MathUtils.damp(current, target, 7, delta)
// Без движения переезды случаются разом на середине участка
const snap = (value: number) => (value >= 0.5 ? 1 : 0)

function updateSceneState(delta: number, width: number, height: number) {
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
  sceneState.lowScreen = isLowScreen(width, height)

  // Холод. Банка переезжает в слот главы (без движения — разом), фон
  // темнеет, банка на стыке «согревается» до комнатной, а дальше остывает
  // по шкале. Температура и влажность — не движение: при "уменьшить
  // движение" они меняются так же плавно, как цвет
  sceneState.cold = followScroll(sceneState.cold, motion.cold, delta)
  const cold = coldState(sceneState.cold, motion.coldLayout, COLD_STOPS.length, frame.coldState)
  sceneState.coldEnter = cold.enter
  sceneState.coldIn = reduced ? snap(cold.enter) : phase(cold.enter, COLD.handoff.stage)
  sceneState.night = phase(cold.enter, COLD.handoff.dark)
  sceneState.coldTurn = reduced ? 0 : COLD_TURN * MathUtils.smoothstep(cold.raw, 0, COLD_STOPS.length - 1)

  // Состав. На стыке ночь рассеивается, иней тает, синяя банка улетает, а
  // Ultra White возвращается и становится стеклянной; на последнем переходе
  // стекло снова становится печатью. Без движения банки меняются разом, а
  // свет, иней и стекло — плавно: это состояния, а не движение
  sceneState.inside = followScroll(sceneState.inside, motion.inside, delta)
  const inside = insideState(sceneState.inside, motion.insideLayout, INSIDE_STOPS, frame.insideState)
  const swap = phase(inside.enter, INSIDE.handoff.swap)
  const seal = MathUtils.clamp(inside.position - (INGREDIENTS.length - 1), 0, 1)
  sceneState.insideEnter = inside.enter
  sceneState.insideIn = reduced ? snap(inside.enter) : phase(inside.enter, INSIDE.handoff.stage)
  sceneState.dawn = phase(inside.enter, INSIDE.handoff.dawn)
  sceneState.encore = reduced ? snap(swap) : swap
  sceneState.glass = phase(inside.enter, INSIDE.handoff.glass) * (1 - phase(seal, INSIDE.seal.glass))
  sceneState.ingredient = reduced ? Math.round(inside.position) : inside.position
  sceneState.ingredientLook = inside.position
  sceneState.insideTurn = reduced ? 0 : INSIDE_TURN * (1 - 2 * MathUtils.smoothstep(inside.raw, 0, INSIDE_STOPS - 1))
  setCanGlass(sceneState.glass)

  // Финальный экран. Банка переезжает в центр (без движения — разом), лёд и
  // капли возвращаются, потом экран затягивает иней. Иней растёт и тает по
  // скроллу — это состояние, как температура; разбивается он по времени
  // (state/frost.ts), и тогда банка делает оборот
  sceneState.final = followScroll(sceneState.final, motion.final, delta)
  const final = finalState(sceneState.final, motion.finalLayout, frame.finalState)
  sceneState.finalEnter = final.enter
  sceneState.finalIn = reduced ? snap(final.enter) : phase(final.enter, FINAL.handoff.stage)
  sceneState.finalLook = phase(final.enter, FINAL.handoff.look)
  sceneState.frostGrow = phase(final.enter, FINAL.handoff.frost)
  sceneState.frostMelt = reduced ? phase(final.raw, FINAL.melt) : 0
  sceneState.finalSpin = reduced ? 0 : frostSpin()
  // Лёд и капли в воздухе уходят за кадр на стыке «Холода» (ночью сцену
  // держат банка, морозный пар и ледяная пыль), «Состав» держит их там, а
  // финал возвращает
  const away = Math.max(phase(cold.enter, COLD.handoff.clear), phase(inside.enter, INSIDE.handoff.clear))
  sceneState.clear = away * (1 - phase(final.enter, FINAL.handoff.ice))

  // Ночь и холод — с учётом рассвета: после «Холода» банка снова «только из
  // холодильника», как на первом экране
  const thaw = phase(inside.enter, INSIDE.handoff.thaw)
  sceneState.dark = sceneState.night * (1 - sceneState.dawn)
  sceneState.temperature = MathUtils.lerp(coldTemperature(cold.position, COLD_TEMPERATURES), FRIDGE, thaw)
  sceneState.chill = MathUtils.clamp((COLD_PHYSICS.dewPoint - sceneState.temperature) / (COLD_PHYSICS.dewPoint - CHILL_FULL), 0, 1)
  sceneState.coldAir = sceneState.night * (1 - phase(inside.enter, COLD_AIR_OUT))
  updateColdSurface(phase(cold.enter, COLD.handoff.dry) * (1 - thaw), sceneState.temperature)

  // Цвета фона, льда и подсветки — после всех глав: «ночь» ложится поверх вкуса
  updateLineupLook()
}

// Слот из CSS-пикселей окна → центр в мировых единицах на плоскости z = 0
// (камера смотрит вдоль -Z на начало координат) и масштаб, при котором
// композиция вписывается в слот
function fitSlot(
  out: SlotFit,
  slot: SlotRect,
  width: number,
  height: number,
  unitsPerPx: number,
  compositionHeight: number,
  compositionWidth = COMPOSITION_WIDTH,
) {
  out.x = (slot.x + slot.width / 2 - width / 2) * unitsPerPx
  out.y = -(slot.y + slot.height / 2 - height / 2) * unitsPerPx
  out.fit = Math.min((slot.height * unitsPerPx) / compositionHeight, (slot.width * unitsPerPx) / compositionWidth)
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
  const coldSlot = motion.coldSlot.width > 0 ? motion.coldSlot : lineupSlot
  const insideSlot = motion.insideSlot.width > 0 ? motion.insideSlot : coldSlot
  const finalSlot = motion.finalSlot.width > 0 ? motion.finalSlot : insideSlot
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
  // Холод: та же банка — в слот своей главы и крупнее
  const cold = fitSlot(frame.cold, coldSlot, width, height, unitsPerPx, sceneState.stacked ? COLD_STACKED_HEIGHT : COLD_COMPOSITION_HEIGHT)
  const coldIn = sceneState.coldIn
  // Состав: слот главы сдвинут от центра (рядом стоят капсулы), банка мельче
  const insideHeight = sceneState.stacked ? INSIDE_STACKED_HEIGHT : INSIDE_COMPOSITION_HEIGHT
  const inside = fitSlot(frame.inside, insideSlot, width, height, unitsPerPx, insideHeight, INSIDE_COMPOSITION_WIDTH)
  const insideIn = sceneState.insideIn
  // Финал: банка снова со льдом, в центре — как в коллекции
  const final = fitSlot(frame.final, finalSlot, width, height, unitsPerPx, sceneState.stacked ? FINAL_STACKED_HEIGHT : COMPOSITION_HEIGHT)
  const finalIn = sceneState.finalIn
  // Главы идут по очереди: каждая следующая уводит композицию из слота предыдущей
  const through = (hero: number, lineupValue: number, coldValue: number, insideValue: number, finalValue: number) =>
    MathUtils.lerp(
      MathUtils.lerp(MathUtils.lerp(MathUtils.lerp(hero, lineupValue, stageIn), coldValue, coldIn), insideValue, insideIn),
      finalValue,
      finalIn,
    )
  const assembled = 1 + ASSEMBLED_GROWTH
  group.position.set(through(heroX, lineup.x, cold.x, inside.x, final.x), through(heroY, lineup.y, cold.y, inside.y, final.y), 0)
  group.scale.setScalar(through(heroScale, lineup.fit * assembled, cold.fit * assembled, inside.fit * assembled, final.fit * assembled))

  // Прямоугольник сцены на экране — по нему фон ставит слово за банкой
  const stage = sceneState.stage
  stage.x = through(heroSlot.x, lineupSlot.x, coldSlot.x, insideSlot.x, finalSlot.x)
  stage.y = through(heroSlot.y, lineupSlot.y, coldSlot.y, insideSlot.y, finalSlot.y)
  stage.width = through(heroSlot.width, lineupSlot.width, coldSlot.width, insideSlot.width, finalSlot.width)
  stage.height = through(heroSlot.height, lineupSlot.height, coldSlot.height, insideSlot.height, finalSlot.height)
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
    updateSceneState(delta, state.size.width, state.size.height)
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
    // Улетела за кадр — выключаем, чтобы не тратить на неё кадр. В «Составе»
    // она возвращается: выплывает из глубины очереди обратно в центр
    const encore = sceneState.encore
    const rel = encore > 0 ? (1 - encore) * ENCORE_FROM : -sceneState.flavor
    const pose = carouselPose(rel, sceneState.stacked && !sceneState.lowScreen, frame.pose)
    carousel.visible = pose.visible
    sceneState.heroCanVisible = pose.visible
    carousel.position.set(pose.x, pose.y, pose.z)
    carousel.rotation.set(pose.rotX, pose.rotY, pose.rotZ)

    // Полный оборот за время сборки, а в сцене деталей — медленный доворот
    // из стороны в сторону, чтобы блики пробегали по металлу и каплям; в
    // коллекции — тот же медленный доворот под скроллом, что у всех банок;
    // в «Составе» — свой (смена доворота не видна: банка в этот момент за
    // кадром), к финалу банка снова смотрит логотипом в камеру и делает
    // полный оборот, когда иней разбит
    const scroll = sceneState.scroll
    const turn = phase(scroll, PHASES.spin)
    const drift = MathUtils.lerp(-0.25, 0.2, phase(scroll, [PHASES.detailIn[0], PHASES.detailOut[1]]))
    const lineupHold = motion.reducedMotion ? 0 : holdTurn(sceneState.flavorRaw, 0) * sceneState.stageIn
    const finalHold = sceneState.insideTurn * (1 - sceneState.finalIn) + sceneState.finalSpin * Math.PI * 2
    const hold = encore > 0 ? finalHold : lineupHold
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
