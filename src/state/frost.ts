import { CLAW_HEIGHT, CLAW_STROKES, CLAW_WIDTH } from '@/brand/logoPaths'
import { smoothstep } from '@/utils/smoothstep'
import { motion } from './motion'

// Иней финального экрана — общее состояние DOM ↔ 3D, как motion:
//  - маска протёртого: маленький 2D-canvas, в который указатель (мышь, перо,
//    палец) рисует мягкой кистью; сцена берёт его текстурой
//    (three/final/FrostGlass.tsx) — где маска белая, инея нет;
//  - разбито ли стекло. Момент разбития — событие (протёрли достаточно,
//    нажали «Break the ice», доскроллили дальше), а удар когтя, трещины и
//    осколки после него идут по времени от brokenAt;
//  - можно ли протирать: иней на экране — курсор становится скребком.
//
// Фаза меняется редко (разбили, иней вернулся) — на неё подписывается DOM.
// Маска меняется часто, но её читает только сцена — по флагу dirty.

export type FrostPhase = 'frozen' | 'broken'
// shatter — удар когтя и осколки; melt — иней тает (при «уменьшить движение»)
export type FrostBreakMode = 'shatter' | 'melt'

// Сторона маски, px. Маска растянута на весь экран (по горизонтали и вертикали
// масштаб разный — кисть рисуется эллипсом, на экране выходит кругом). Край
// протёртого шейдер рвёт шумом кристаллов, так что крупное зерно маски не видно.
// Каналы: R — протёрто (кистью или когтем), G — прорезано когтем: у прорези
// своя, более глубокая кромка (frostMaterial.ts)
export const FROST_MASK_SIZE = 256

// Тайминги разбития, секунды от brokenAt
export const FROST_TIMING = {
  // Коготь прорезает иней: пряди одна за другой, сверху вниз
  claw: [0, 0.34],
  // Трещины бегут от удара по всему стеклу
  crack: [0.26, 0.62],
  // Осколки начинают падать — ближние к удару первыми, дальние позже на stagger
  fall: 0.58,
  stagger: 0.5,
  // Все осколки за кадром — стекло можно убрать
  done: 2.7,
  // Банка делает оборот, пока сыплются осколки
  spin: [0.42, 1.8],
  // «Уменьшить движение»: иней тает за это время
  melt: 0.9,
} as const

// Доля протёртого в слоте банки, после которой иней разбивается сам
export const FROST_WIPE_THRESHOLD = 0.3
// Протёрли хоть что-то (доля всего экрана) — подсказка гаснет
const WIPED_HINT = 0.012

// Коготь по инею: пряди начинаются одна за другой, весь удар чуть наклонён
const CLAW_STAGGER = 0.16
const CLAW_TILT = 0.1
// Обводки края прорези: толщина в единицах когтя (его высота — 100) и
// непрозрачность — от широкой бледной к узкой плотной
const CLAW_EDGE: [number, number][] = [
  [7, 0.3],
  [4, 0.6],
  [1.5, 1],
]

export const frost = {
  phase: 'frozen' as FrostPhase,
  mode: 'shatter' as FrostBreakMode,
  // performance.now() в момент разбития
  brokenAt: 0,
  // Точка удара — центр банки, доли экрана (y вверх, как uv сцены)
  origin: { x: 0.5, y: 0.5 },
  // Номер разбития: сцена по нему заново режет стекло на осколки вокруг удара
  version: 0,
  // Маска изменилась после последней загрузки в видеопамять
  dirty: false,
  // Протёрто ли хоть что-то — подсказка «протри» гаснет
  wiped: false,
  // Иней на экране и его можно протирать (пишет animations/finalScroll.ts)
  wipeable: false,
  // Размер сцены, CSS px — пишет сцена (canvas во весь экран)
  view: { width: 1, height: 1 },
}

// --- Подписка ------------------------------------------------------------------------

const listeners = new Set<() => void>()

export function subscribeFrost(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify() {
  for (const listener of listeners) listener()
}

// --- Маска ---------------------------------------------------------------------------

let maskContext: CanvasRenderingContext2D | null = null
// В маске есть протёртое — её есть что чистить при возврате инея
let maskTouched = false

function context(): CanvasRenderingContext2D {
  if (!maskContext) {
    const canvas = document.createElement('canvas')
    canvas.width = FROST_MASK_SIZE
    canvas.height = FROST_MASK_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    maskContext = ctx
    fillMask(ctx)
  }
  return maskContext
}

function fillMask(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, FROST_MASK_SIZE, FROST_MASK_SIZE)
}

// Canvas маски — источник текстуры для сцены
export function frostMaskCanvas(): HTMLCanvasElement {
  return context().canvas
}

// CSS px экрана → px маски
const maskScaleX = () => FROST_MASK_SIZE / Math.max(1, frost.view.width)
const maskScaleY = () => FROST_MASK_SIZE / Math.max(1, frost.view.height)

// Кисть — мягкий круг (только канал R), нарисованный один раз: штамп картинкой дешевле,
// чем новый градиент на каждый шаг штриха
let brushCanvas: HTMLCanvasElement | null = null

function brush(): HTMLCanvasElement {
  if (!brushCanvas) {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.9)')
    gradient.addColorStop(0.55, 'rgba(255, 0, 0, 0.7)')
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    brushCanvas = canvas
  }
  return brushCanvas
}

// Радиус кисти, CSS px: у мыши — размер кольца курсора, у пальца — шире
// (палец закрывает больше и менее точен)
export function frostBrushRadius(kind: 'pointer' | 'touch'): number {
  const short = Math.min(window.innerWidth, window.innerHeight)
  return kind === 'touch' ? Math.max(38, short * 0.1) : Math.min(76, Math.max(34, short * 0.064))
}

// Протереть отрезок от (x0, y0) до (x1, y1), CSS px экрана. Штампы кисти —
// чаще трети радиуса: один проход вытирает иней дочиста, как пальцем по стеклу
export function wipeFrost(x0: number, y0: number, x1: number, y1: number, radius: number) {
  if (frost.phase !== 'frozen') return
  const ctx = context()
  const sprite = brush()
  const sx = maskScaleX()
  const sy = maskScaleY()
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (radius * 0.3)))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    ctx.drawImage(sprite, (x - radius) * sx, (y - radius) * sy, radius * 2 * sx, radius * 2 * sy)
  }
  maskTouched = true
  frost.dirty = true
  scheduleMeasure()
}

// --- Сколько протёрто ----------------------------------------------------------------

// Маска уменьшается до PROBE × PROBE и считается по пикселям — не чаще, чем
// раз в MEASURE_DELAY, пока по стеклу водят
const PROBE = 48
const MEASURE_DELAY = 140
let probeContext: CanvasRenderingContext2D | null = null
let measureTimer = 0

function scheduleMeasure() {
  if (measureTimer) return
  measureTimer = window.setTimeout(measure, MEASURE_DELAY)
}

function measure() {
  measureTimer = 0
  if (frost.phase !== 'frozen') return
  if (!probeContext) {
    const canvas = document.createElement('canvas')
    canvas.width = PROBE
    canvas.height = PROBE
    probeContext = canvas.getContext('2d', { willReadFrequently: true })
    if (!probeContext) return
  }
  const probe = probeContext
  probe.imageSmoothingEnabled = true
  probe.imageSmoothingQuality = 'high'
  probe.drawImage(context().canvas, 0, 0, PROBE, PROBE)
  const data = probe.getImageData(0, 0, PROBE, PROBE).data

  // Главное — банка: доля протёртого в её слоте; без замера слота — середина экрана
  const { view } = frost
  const slot = motion.finalSlot.width > 0 ? motion.finalSlot : { x: view.width * 0.25, y: view.height * 0.15, width: view.width * 0.5, height: view.height * 0.7 }
  const cell = (value: number, size: number) => Math.min(PROBE, Math.max(0, Math.round((value / Math.max(1, size)) * PROBE)))
  const x0 = cell(slot.x, view.width)
  const x1 = Math.max(x0 + 1, cell(slot.x + slot.width, view.width))
  const y0 = cell(slot.y, view.height)
  const y1 = Math.max(y0 + 1, cell(slot.y + slot.height, view.height))
  let total = 0
  let inSlot = 0
  for (let y = 0; y < PROBE; y++) {
    for (let x = 0; x < PROBE; x++) {
      const value = data[(y * PROBE + x) * 4] / 255
      total += value
      if (x >= x0 && x < x1 && y >= y0 && y < y1) inSlot += value
    }
  }

  if (!frost.wiped && total / (PROBE * PROBE) > WIPED_HINT) {
    frost.wiped = true
    notify()
  }
  if (inSlot / ((x1 - x0) * (y1 - y0)) >= FROST_WIPE_THRESHOLD) breakFrost(motion.reducedMotion ? 'melt' : 'shatter')
}

// --- Удар когтя ------------------------------------------------------------------------

let clawPaths: Path2D[] | null = null
// Докуда уже прорезана каждая прядь, 0..1: за кадр рисуется только новая
// полоса — полупрозрачные обводки края, нарисованные повторно, слились бы в
// резкий край
let clawReach: number[] = []

// Коготь Monster прорезает иней поверх банки — те же контуры, что у логотипа
// (brand/logoPaths.ts). progress 0..1 — время удара: каждая прядь «режет»
// сверху вниз, следующая — чуть позже. Рисуется в ту же маску (канал G —
// «это коготь»): прорезанное становится чистым стеклом, дальше бегут трещины
export function paintFrostClaw(progress: number) {
  const ctx = context()
  clawPaths ??= CLAW_STROKES.map((d) => new Path2D(d))
  const { view } = frost
  const slot = motion.finalSlot.width > 0 ? motion.finalSlot : { x: 0, y: 0, width: view.width, height: view.height }
  const height = Math.min(slot.height * 0.96, view.height * 0.74)
  const scale = height / CLAW_HEIGHT
  const span = 1 - CLAW_STAGGER * (clawPaths.length - 1)

  ctx.save()
  ctx.setTransform(maskScaleX(), 0, 0, maskScaleY(), 0, 0)
  ctx.translate(slot.x + slot.width / 2, slot.y + slot.height / 2)
  ctx.rotate(CLAW_TILT)
  ctx.scale(scale, scale)
  ctx.translate(-CLAW_WIDTH / 2, -CLAW_HEIGHT / 2)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffff00'
  ctx.strokeStyle = '#ffff00'
  ctx.lineJoin = 'round'
  clawPaths.forEach((path, index) => {
    const local = Math.min(1, Math.max(0, (progress - index * CLAW_STAGGER) / span))
    if (local <= 0) return
    // Удар разгоняется: прядь сначала едва надрезает, потом рвёт до конца
    const reach = local * local * (3 - 2 * local)
    const from = clawReach[index] ?? 0
    if (reach <= from) return
    clawReach[index] = reach
    const strip = CLAW_HEIGHT + 16
    ctx.save()
    ctx.beginPath()
    ctx.rect(-8, -8 + strip * from, CLAW_WIDTH + 16, strip * (reach - from))
    ctx.clip()
    // Край прорези — мягкий спад в несколько обводок: маска маленькая, и
    // резкий край заливки дал бы на экране ступеньки, а шейдеру для рваного
    // края нужен плавный переход
    for (const [width, alpha] of CLAW_EDGE) {
      ctx.globalAlpha = alpha
      ctx.lineWidth = width
      ctx.stroke(path)
    }
    ctx.globalAlpha = 1
    ctx.fill(path)
    ctx.restore()
  })
  ctx.restore()
  maskTouched = true
  frost.dirty = true
}

// --- Разбить и вернуть -------------------------------------------------------------------

export function breakFrost(mode: FrostBreakMode) {
  if (frost.phase === 'broken') return
  frost.phase = 'broken'
  frost.mode = mode
  frost.brokenAt = performance.now()
  frost.version += 1
  clawReach = []
  // Удар приходится в центр банки
  const { view } = frost
  const slot = motion.finalSlot
  frost.origin.x = slot.width > 0 ? (slot.x + slot.width / 2) / Math.max(1, view.width) : 0.5
  frost.origin.y = slot.height > 0 ? 1 - (slot.y + slot.height / 2) / Math.max(1, view.height) : 0.5
  syncCursor()
  notify()
}

// Иней возвращается: глава ушла со сцены (скролл выше стыка) — следующий
// заход снова начнётся с замёрзшего стекла
export function resetFrost() {
  if (frost.phase === 'frozen' && !maskTouched) return
  window.clearTimeout(measureTimer)
  measureTimer = 0
  frost.phase = 'frozen'
  frost.brokenAt = 0
  frost.wiped = false
  fillMask(context())
  maskTouched = false
  frost.dirty = true
  syncCursor()
  notify()
}

// Секунды с момента разбития; −1 — стекло целое
export function frostElapsed(): number {
  return frost.phase === 'broken' ? (performance.now() - frost.brokenAt) / 1000 : -1
}

// Оборот банки после удара 0..1 (только когда стекло бьётся, а не тает)
export function frostSpin(): number {
  if (frost.phase !== 'broken' || frost.mode !== 'shatter') return 0
  const [from, to] = FROST_TIMING.spin
  return smoothstep(frostElapsed(), from, to)
}

// --- Курсор-скребок -------------------------------------------------------------------------

// Пока иней можно протирать, кольцо курсора вырастает до размера кисти
// (Cursor.module.css читает data-cursor и --wipe-size на <html>)
function syncCursor() {
  const root = document.documentElement
  if (frost.wipeable && frost.phase === 'frozen') {
    root.dataset.cursor = 'wipe'
    root.style.setProperty('--wipe-size', `${Math.round(frostBrushRadius('pointer') * 2)}px`)
  } else if (root.dataset.cursor === 'wipe') {
    delete root.dataset.cursor
  }
}

export function setFrostWipeable(on: boolean) {
  if (frost.wipeable === on) return
  frost.wipeable = on
  syncCursor()
}

// Размер окна сменился — кольцу нужен новый размер кисти
export function refreshFrostCursor() {
  syncCursor()
}
