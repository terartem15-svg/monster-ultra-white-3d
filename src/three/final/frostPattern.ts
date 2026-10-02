import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGFormat, UnsignedByteType } from 'three'
import { createRandom, randomRange } from '../utils/random'

// Узор инея на стекле финального экрана — бесшовная плитка, которая
// повторяется по экрану с постоянным размером в CSS-пикселях: на телефоне
// папоротники того же размера, что и на десктопе, просто их меньше. Два канала:
//  - R — «приход»: насколько раньше общего фронта сюда приходит иней
//    (0 — сильно раньше: стебли папоротников, ~0.65 — дымка между ними).
//    Сам фронт ползёт от краёв экрана — его считает шейдер
//    (frostMaterial.ts); плитка только рвёт его и пускает папоротники вперёд;
//  - G — плотность: стебли — сплошной белый кристалл, вокруг них ореол, между
//    ними тонкая дымка, сквозь которую видна размытая сцена.
//
// Модель папоротника та же, что у инея на банке (three/can/cold/frost.ts):
// ствол и боковые ветки под ~60° (гексагональная решётка льда). На экране
// узор крупнее, поэтому здесь есть и ветки второго порядка.

export const FROST_PATTERN_SIZE = 1024
// Сколько CSS-пикселей экрана приходится на тексель плитки: плитка ~1280 px —
// на обычном десктопе узор почти не повторяется
export const FROST_PATTERN_TEXEL = 1.25

const SIZE = FROST_PATTERN_SIZE

// --- Шум, бесшовный по обеим осям ------------------------------------------------------

function createNoise(cells: number, seed: number) {
  const random = createRandom(seed)
  const grid = Float32Array.from({ length: cells * cells }, () => random())
  const wrap = (value: number) => ((value % cells) + cells) % cells
  const at = (cx: number, cy: number) => grid[wrap(cy) * cells + wrap(cx)]
  return (u: number, v: number) => {
    const gx = u * cells
    const gy = v * cells
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return top + (bottom - top) * sy
  }
}

function createFbm(seed: number) {
  const octaves = [
    { noise: createNoise(5, seed), weight: 0.55 },
    { noise: createNoise(11, seed + 1), weight: 0.3 },
    { noise: createNoise(23, seed + 2), weight: 0.15 },
  ]
  return (u: number, v: number) => octaves.reduce((sum, { noise, weight }) => sum + noise(u, v) * weight, 0)
}

// --- Дымка между папоротниками ---------------------------------------------------------

// Плавная, поэтому считается на сетке вчетверо реже и растягивается
const BASE_SCALE = 4
// «Приход» дымки и разброс по шуму: где-то иней садится раньше, где-то позже
const HAZE_ARRIVAL = 0.64
const HAZE_SPREAD = 0.36
// Плотность дымки: облаками, от тонкой до заметной
const HAZE_DENSITY = [0.26, 0.56] as const

function paintHaze(arrival: CanvasRenderingContext2D, density: CanvasRenderingContext2D) {
  const small = SIZE / BASE_SCALE
  const arrivalFbm = createFbm(311)
  const densityFbm = createFbm(419)
  const arrivalImage = arrival.createImageData(small, small)
  const densityImage = density.createImageData(small, small)
  for (let y = 0; y < small; y++) {
    for (let x = 0; x < small; x++) {
      const u = x / small
      const v = y / small
      const offset = (y * small + x) * 4
      const a = Math.round(Math.min(1, Math.max(0, HAZE_ARRIVAL + (arrivalFbm(u, v) - 0.5) * HAZE_SPREAD)) * 255)
      const d = Math.round((HAZE_DENSITY[0] + (HAZE_DENSITY[1] - HAZE_DENSITY[0]) * densityFbm(u, v)) * 255)
      arrivalImage.data.set([a, a, a, 255], offset)
      densityImage.data.set([d, d, d, 255], offset)
    }
  }
  // Растягиваем через промежуточный холст: putImageData не масштабирует.
  // Плитка бесшовная — её копии вокруг дают правильное сглаживание у краёв
  for (const [target, image] of [
    [arrival, arrivalImage],
    [density, densityImage],
  ] as const) {
    const tile = createContext(small)
    tile.putImageData(image, 0, 0)
    target.imageSmoothingEnabled = true
    target.imageSmoothingQuality = 'high'
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) target.drawImage(tile.canvas, dx * SIZE, dy * SIZE, SIZE, SIZE)
    }
  }
}

// --- Папоротники -------------------------------------------------------------------------

interface Segment {
  x0: number
  y0: number
  x1: number
  y1: number
  width: number
  arrival: number
  density: number
}

interface FernLevel {
  // Прирост «прихода» на пиксель длины: чем меньше, тем быстрее ветка
  // обгоняет общий фронт
  rate: number
  // Толщина у основания и у кончика, px плитки
  width: [number, number]
  // Расстояние между боковыми ветками, px; 0 — веток нет
  spacing: [number, number]
  // Длина боковой ветки — доля оставшейся длины ствола
  share: [number, number]
}

const FERN_LEVELS: FernLevel[] = [
  { rate: 0.0011, width: [3.2, 1.2], spacing: [10, 16], share: [0.28, 0.5] },
  { rate: 0.0014, width: [1.9, 0.8], spacing: [9, 14], share: [0.22, 0.42] },
  { rate: 0.0017, width: [1.1, 0.6], spacing: [0, 0], share: [0, 0] },
]
const STEP = 6
// Ореол вокруг ветки: шире, чуть позже и не такой плотный — узор сначала
// тонкий, потом «обрастает»
const HALO_WIDTH = 2.6
const HALO_DELAY = 0.05
const HALO_DENSITY = 0.66
// Ветки короче этого не растут
const MIN_BRANCH = 14

function growFern(
  segments: Segment[],
  random: () => number,
  x: number,
  y: number,
  heading: number,
  length: number,
  arrival: number,
  depth: number,
) {
  const level = FERN_LEVELS[depth]
  const steps = Math.max(2, Math.round(length / STEP))
  let side = random() < 0.5 ? 1 : -1
  let nextBranch = level.spacing[1] > 0 ? randomRange(random, level.spacing[0], level.spacing[1]) : Number.POSITIVE_INFINITY
  let currentX = x
  let currentY = y
  let currentArrival = arrival
  let currentHeading = heading
  for (let i = 0; i < steps; i++) {
    currentHeading += randomRange(random, -0.12, 0.12)
    const nextX = currentX + Math.cos(currentHeading) * STEP
    const nextY = currentY + Math.sin(currentHeading) * STEP
    const t = i / steps
    const width = level.width[0] + (level.width[1] - level.width[0]) * t
    segments.push({ x0: currentX, y0: currentY, x1: nextX, y1: nextY, width, arrival: currentArrival, density: 1 })
    segments.push({
      x0: currentX,
      y0: currentY,
      x1: nextX,
      y1: nextY,
      width: width * HALO_WIDTH,
      arrival: currentArrival + HALO_DELAY,
      density: HALO_DENSITY,
    })
    currentX = nextX
    currentY = nextY
    currentArrival += STEP * level.rate

    // Боковые ветки под ~60° — часто парами, как листья папоротника
    if (i * STEP >= nextBranch) {
      const branchLength = (length - i * STEP) * randomRange(random, level.share[0], level.share[1])
      if (branchLength > MIN_BRANCH) {
        const angle = randomRange(random, 0.94, 1.14)
        growFern(segments, random, currentX, currentY, currentHeading + side * angle, branchLength, currentArrival, depth + 1)
        if (random() < 0.55) {
          growFern(segments, random, currentX, currentY, currentHeading - side * angle, branchLength * 0.8, currentArrival + 0.01, depth + 1)
        }
      }
      side = -side
      nextBranch += randomRange(random, level.spacing[0], level.spacing[1])
    }
  }
}

// Корни — по всей плитке, в любом направлении: на стекле кристаллы
// зарождаются на пылинках и царапинах где угодно. Часть стартует раньше —
// эти узоры видны первыми, ещё до сплошного инея
const ROOTS = 30

function collectFerns(): Segment[] {
  const random = createRandom(4049)
  const segments: Segment[] = []
  for (let i = 0; i < ROOTS; i++) {
    growFern(
      segments,
      random,
      randomRange(random, 0, SIZE),
      randomRange(random, 0, SIZE),
      randomRange(random, 0, Math.PI * 2),
      randomRange(random, 170, 440),
      randomRange(random, 0.02, 0.2),
      0,
    )
  }
  return segments
}

// Отрезки одного уровня и одной толщины — одним путём (десятки тысяч
// отдельных stroke() заняли бы секунды). Плитка бесшовная: ветка, ушедшая за
// край, продолжается с противоположной стороны
function paintSegments(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  value: (segment: Segment) => number,
  operation: GlobalCompositeOperation,
) {
  const buckets = new Map<number, { width: number; level: number; path: Path2D }>()
  for (const segment of segments) {
    const level = Math.round(Math.min(1, Math.max(0, value(segment))) * 255)
    const width = Math.round(segment.width * 4) / 4
    const key = level * 1000 + Math.round(width * 4)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { width, level, path: new Path2D() }
      buckets.set(key, bucket)
    }
    const margin = width * 2
    for (const dy of [-SIZE, 0, SIZE]) {
      for (const dx of [-SIZE, 0, SIZE]) {
        const x0 = segment.x0 + dx
        const x1 = segment.x1 + dx
        const y0 = segment.y0 + dy
        const y1 = segment.y1 + dy
        if (Math.max(x0, x1) < -margin || Math.min(x0, x1) > SIZE + margin) continue
        if (Math.max(y0, y1) < -margin || Math.min(y0, y1) > SIZE + margin) continue
        bucket.path.moveTo(x0, y0)
        bucket.path.lineTo(x1, y1)
      }
    }
  }
  ctx.save()
  ctx.globalCompositeOperation = operation
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const { width, level, path } of buckets.values()) {
    ctx.lineWidth = width
    ctx.strokeStyle = `rgb(${level}, ${level}, ${level})`
    ctx.stroke(path)
  }
  ctx.restore()
}

// --- Сборка ----------------------------------------------------------------------------------

function createContext(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  return ctx
}

function buildPattern(): DataTexture {
  const arrival = createContext(SIZE)
  const density = createContext(SIZE)
  paintHaze(arrival, density)
  const ferns = collectFerns()
  // «Приход»: раньше — темнее (минимум), плотность: гуще — светлее (максимум)
  paintSegments(arrival, ferns, (segment) => segment.arrival, 'darken')
  paintSegments(density, ferns, (segment) => segment.density, 'lighten')

  const r = arrival.getImageData(0, 0, SIZE, SIZE).data
  const g = density.getImageData(0, 0, SIZE, SIZE).data
  const data = new Uint8Array(SIZE * SIZE * 2)
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 2] = r[i * 4]
    data[i * 2 + 1] = g[i * 4]
  }

  const texture = new DataTexture(data, SIZE, SIZE, RGFormat, UnsignedByteType)
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

// Плитка строится один раз (~0.1 с процессора, пока висит прелоадер) и живёт
// столько же, сколько страница. Промис кэшируется: его ждёт FrostGlass через use()
let patternPromise: Promise<DataTexture> | null = null

export function loadFrostPattern(): Promise<DataTexture> {
  patternPromise ??= Promise.resolve().then(buildPattern)
  return patternPromise
}
