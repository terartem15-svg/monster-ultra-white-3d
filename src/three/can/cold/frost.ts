import { createRandom, randomRange } from '../../utils/random'
import { CAN_HEIGHT } from '../canDimensions'
import { LAYOUT, PANEL_CENTER, PX_PER_UNIT, TEXTURE_HEIGHT, TEXTURE_WIDTH, createContext2d, toCanvasY, uToX } from '../label/canvas'

// Иней на банке — тоже отдельно от этикетки. Вместо картинки инея здесь
// карта «прихода»: для каждого пикселя развёртки — когда до него доходит
// фронт инея (0 — первым, 1 — никогда). Шейдер (coldSurface.ts) сравнивает
// её с уровнем холода uColdFrostLevel: всё, куда фронт уже пришёл, покрыто
// инеем, и чем раньше пришёл — тем иней гуще. Так иней честно растёт от
// краёв, а не проявляется прозрачностью.
//
// Из чего складывается карта:
//  - фронт от краёв: металл горлышка и каблука покрывается первым (на
//    первом экране виден только он — как раньше), дальше иней ползёт в
//    печать, неровно — по шуму;
//  - «папоротники»: ветвистые языки кристаллов обгоняют фронт, как
//    морозные узоры на стекле;
//  - пятна вокруг крупных капель: капля замерзает, от неё расходится иней.
//
// Отдельно — маленькая бесшовная текстура «зерна»: грани кристалликов
// (случайный наклон, у редких — зеркальный блеск). Из-за неё иней
// искрится, когда банка поворачивается.

// --- Фронт от краёв -------------------------------------------------------------------

// Металл горлышка (выше печати) и каблука (ниже) — ед. от края банки
const NECK = CAN_HEIGHT - LAYOUT.printTop
const HEEL = LAYOUT.printBottom
// К этой доле «прихода» металл покрыт целиком
const METAL_ARRIVAL = 0.1
// Как глубоко в печать уходит сплошной иней к приходу 0.9, ед.: сверху — до
// кончиков когтя, снизу — до надписи ENERGY. Дальше тянутся только
// папоротники: коготь и MONSTER остаются читаемыми даже в самый мороз
const TOP_REACH = 0.5
const BOTTOM_REACH = 0.42

function baseArrival(heightUnits: number): number {
  const fromTop = CAN_HEIGHT - heightUnits
  const fromBottom = heightUnits
  const top = fromTop < NECK ? (METAL_ARRIVAL * fromTop) / NECK : METAL_ARRIVAL + ((fromTop - NECK) / TOP_REACH) * 0.8
  const bottom =
    fromBottom < HEEL ? (METAL_ARRIVAL * fromBottom) / HEEL : METAL_ARRIVAL + ((fromBottom - HEEL) / BOTTOM_REACH) * 0.8
  return Math.min(top, bottom)
}

// Бесшовный по горизонтали value-noise: решётка замыкается по окружности банки
function createNoise(columns: number, rows: number, seed: number) {
  const random = createRandom(seed)
  const grid = Float32Array.from({ length: columns * (rows + 1) }, () => random())
  const at = (cx: number, cy: number) => grid[Math.min(rows, Math.max(0, cy)) * columns + (((cx % columns) + columns) % columns)]
  return (u: number, v: number) => {
    const gx = u * columns
    const gy = v * rows
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

// Три октавы; ячейки по вертикали пропорциональны высоте — шум не вытянут
const ASPECT = TEXTURE_HEIGHT / TEXTURE_WIDTH
const OCTAVES = [
  { noise: createNoise(9, Math.round(9 * ASPECT), 71), weight: 0.55 },
  { noise: createNoise(21, Math.round(21 * ASPECT), 72), weight: 0.3 },
  { noise: createNoise(47, Math.round(47 * ASPECT), 73), weight: 0.15 },
]

function fbm(u: number, v: number): number {
  let value = 0
  for (const { noise, weight } of OCTAVES) value += noise(u, v) * weight
  return value
}

// Базовый фронт считается на сетке вчетверо реже и растягивается до полного
// размера: он плавный, а 3.4 млн пикселей шума на странице — это заметная пауза
const BASE_SCALE = 4

function paintBase(ctx: CanvasRenderingContext2D) {
  const width = TEXTURE_WIDTH / BASE_SCALE
  const height = Math.ceil(TEXTURE_HEIGHT / BASE_SCALE)
  const small = createContext2d(width, height)
  const image = small.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    const heightUnits = CAN_HEIGHT - ((y + 0.5) * BASE_SCALE) / PX_PER_UNIT
    const base = baseArrival(heightUnits)
    for (let x = 0; x < width; x++) {
      // На металле фронт почти ровный, в печати — рваный
      const wobble = (fbm(x / width, y / height) - 0.5) * (base < METAL_ARRIVAL ? 0.07 : 0.24)
      const level = Math.round(Math.min(1, Math.max(0, base + wobble)) * 255)
      const offset = (y * width + x) * 4
      image.data[offset] = level
      image.data[offset + 1] = level
      image.data[offset + 2] = level
      image.data[offset + 3] = 255
    }
  }
  small.putImageData(image, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small.canvas, 0, 0, TEXTURE_WIDTH, height * BASE_SCALE)
}

// --- Папоротники ----------------------------------------------------------------------

// Отрезок узора: толщина и «приход» (когда его покроет иней)
interface Segment {
  x0: number
  y0: number
  x1: number
  y1: number
  width: number
  arrival: number
}

interface FernLevel {
  // Прирост «прихода» на пиксель длины: чем меньше, тем быстрее ветка
  // обгоняет общий фронт
  rate: number
  // Толщина у основания и у кончика, px развёртки
  width: [number, number]
  // Расстояние между боковыми ветками, px
  spacing: [number, number]
}

// Ствол и боковые ветки. Третьего уровня нет: на экране он тоньше пикселя.
// Ветки заметно быстрее сплошного фронта — узор тянется далеко впереди него
const FERN_LEVELS: FernLevel[] = [
  { rate: 0.0006, width: [6, 2.2], spacing: [12, 19] },
  { rate: 0.0008, width: [3.4, 1.3], spacing: [0, 0] },
]
const STEP = 6
// Ореол вокруг ветки: шире и чуть позже — узор сначала тонкий, потом «обрастает»
const HALO_WIDTH = 2.4
const HALO_DELAY = 0.05

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
  let nextBranch = randomRange(random, level.spacing[0], level.spacing[1])
  let currentX = x
  let currentY = y
  let currentArrival = arrival
  let currentHeading = heading
  for (let i = 0; i < steps; i++) {
    currentHeading += randomRange(random, -0.13, 0.13)
    const nextX = currentX + Math.cos(currentHeading) * STEP
    const nextY = currentY + Math.sin(currentHeading) * STEP
    const t = i / steps
    const width = level.width[0] + (level.width[1] - level.width[0]) * t
    segments.push({ x0: currentX, y0: currentY, x1: nextX, y1: nextY, width, arrival: currentArrival })
    segments.push({
      x0: currentX,
      y0: currentY,
      x1: nextX,
      y1: nextY,
      width: width * HALO_WIDTH,
      arrival: currentArrival + HALO_DELAY,
    })
    currentX = nextX
    currentY = nextY
    currentArrival += STEP * level.rate

    // Боковые ветки под ~60° — как у кристаллов льда (гексагональная решётка);
    // часто парами, как листья папоротника
    if (depth === 0 && i * STEP >= nextBranch) {
      const branchLength = (length - i * STEP) * randomRange(random, 0.28, 0.5)
      if (branchLength > 14) {
        const angle = randomRange(random, 0.92, 1.15)
        growFern(segments, random, currentX, currentY, currentHeading + side * angle, branchLength, currentArrival, 1)
        if (random() < 0.55) {
          growFern(segments, random, currentX, currentY, currentHeading - side * angle, branchLength * 0.8, currentArrival + 0.01, 1)
        }
      }
      side = -side
      nextBranch += randomRange(random, level.spacing[0], level.spacing[1])
    }
  }
}

// Корни папоротников — на границе металла и печати, по всей окружности.
// Сверху стебли растут вниз, снизу — вверх
function collectFerns(): Segment[] {
  const random = createRandom(2718)
  const segments: Segment[] = []
  const rims = [
    { y: toCanvasY(LAYOUT.printTop), heading: Math.PI / 2, count: 26, length: [220, 430] },
    { y: toCanvasY(LAYOUT.printBottom), heading: -Math.PI / 2, count: 22, length: [170, 340] },
  ]
  for (const rim of rims) {
    for (let i = 0; i < rim.count; i++) {
      const x = ((i + randomRange(random, 0.15, 0.85)) / rim.count) * TEXTURE_WIDTH
      const y = rim.y + randomRange(random, -14, 14)
      const heading = rim.heading + randomRange(random, -0.35, 0.35)
      const length = randomRange(random, rim.length[0], rim.length[1])
      growFern(segments, random, x, y, heading, length, METAL_ARRIVAL + randomRange(random, 0, 0.04), 0)
    }
  }
  return segments
}

// Отрезки одного «прихода» и одной толщины рисуются одним путём — десятки
// тысяч отдельных stroke() на холсте заняли бы секунды
function paintSegments(ctx: CanvasRenderingContext2D, segments: Segment[]) {
  const buckets = new Map<number, { width: number; level: number; path: Path2D }>()
  for (const segment of segments) {
    const level = Math.round(Math.min(1, Math.max(0, segment.arrival)) * 255)
    const width = Math.round(segment.width * 4) / 4
    const key = level * 1000 + Math.round(width * 4)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { width, level, path: new Path2D() }
      buckets.set(key, bucket)
    }
    // У шва развёртки ветка продолжается с другой стороны
    for (const shift of [-TEXTURE_WIDTH, 0, TEXTURE_WIDTH]) {
      const x0 = segment.x0 + shift
      const x1 = segment.x1 + shift
      if (Math.max(x0, x1) < -12 || Math.min(x0, x1) > TEXTURE_WIDTH + 12) continue
      bucket.path.moveTo(x0, segment.y0)
      bucket.path.lineTo(x1, segment.y1)
    }
  }
  ctx.save()
  ctx.globalCompositeOperation = 'darken'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const { width, level, path } of buckets.values()) {
    ctx.lineWidth = width
    ctx.strokeStyle = `rgb(${level}, ${level}, ${level})`
    ctx.stroke(path)
  }
  ctx.restore()
}

// --- Иней вокруг замёрзших капель ---------------------------------------------------------

export interface FrostSeed {
  x: number
  y: number
  r: number
}

// Мягкие пятна поздно: сначала замерзают сами капли, потом вокруг них
// расходится иней. У лицевой панели пятен меньше — коготь должен читаться
function paintSeeds(ctx: CanvasRenderingContext2D, seeds: FrostSeed[]) {
  const random = createRandom(1618)
  const frontX = uToX(PANEL_CENTER.front)
  ctx.save()
  ctx.globalCompositeOperation = 'darken'
  for (const seed of seeds) {
    let distanceX = Math.abs(seed.x - frontX)
    if (distanceX > TEXTURE_WIDTH / 2) distanceX = TEXTURE_WIDTH - distanceX
    if (distanceX < 150 && random() < 0.7) continue
    const radius = seed.r * randomRange(random, 2.2, 3.4)
    const center = randomRange(random, 0.6, 0.8)
    const gradient = ctx.createRadialGradient(seed.x, seed.y, seed.r * 0.6, seed.x, seed.y, radius)
    const level = (value: number) => {
      const byte = Math.round(Math.min(1, value) * 255)
      return `rgb(${byte}, ${byte}, ${byte})`
    }
    gradient.addColorStop(0, level(center))
    gradient.addColorStop(0.6, level(center + 0.07))
    gradient.addColorStop(1, level(1))
    ctx.fillStyle = gradient
    for (const shift of [-TEXTURE_WIDTH, 0, TEXTURE_WIDTH]) {
      ctx.fillRect(seed.x - radius + shift, seed.y - radius, radius * 2, radius * 2)
    }
  }
  ctx.restore()
}

// --- Зерно кристаллов ---------------------------------------------------------------------

// Бесшовная текстура граней: ячейки Вороного на торе, у каждой — свой наклон
// (RG), «зеркальность» (B: у редких граней высокая — они и вспыхивают) и
// яркость (A, темнее к стыкам граней — иней читается зернистым)
export const GRAIN_SIZE = 256
// Ячеек на сторону текстуры. Вместе с повтором по банке (coldSurface.ts)
// грань выходит в 2–3 пикселя экрана: иней читается зерном, а не мозаикой
const GRAIN_CELLS = 34

function buildGrain(): Uint8Array {
  const random = createRandom(577)
  const cells = Array.from({ length: GRAIN_CELLS * GRAIN_CELLS }, (_, index) => {
    const angle = randomRange(random, 0, Math.PI * 2)
    const tilt = Math.sqrt(random())
    return {
      x: ((index % GRAIN_CELLS) + randomRange(random, 0.1, 0.9)) / GRAIN_CELLS,
      y: (Math.floor(index / GRAIN_CELLS) + randomRange(random, 0.1, 0.9)) / GRAIN_CELLS,
      slopeX: Math.cos(angle) * tilt,
      slopeY: Math.sin(angle) * tilt,
      sparkle: random() < 0.08 ? randomRange(random, 0.75, 1) : randomRange(random, 0, 0.18),
      shade: randomRange(random, 0.9, 1),
    }
  })
  const data = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE * 4)
  for (let y = 0; y < GRAIN_SIZE; y++) {
    for (let x = 0; x < GRAIN_SIZE; x++) {
      const u = (x + 0.5) / GRAIN_SIZE
      const v = (y + 0.5) / GRAIN_SIZE
      const cx = Math.floor(u * GRAIN_CELLS)
      const cy = Math.floor(v * GRAIN_CELLS)
      let nearest = Number.POSITIVE_INFINITY
      let second = Number.POSITIVE_INFINITY
      let owner = cells[0]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = (cx + dx + GRAIN_CELLS) % GRAIN_CELLS
          const ny = (cy + dy + GRAIN_CELLS) % GRAIN_CELLS
          const cell = cells[ny * GRAIN_CELLS + nx]
          // Центр соседней ячейки с учётом замыкания тора: за краем
          // текстуры ячейка берётся с противоположной стороны, сдвинутая на период
          const px = cell.x + (cx + dx - nx) / GRAIN_CELLS
          const py = cell.y + (cy + dy - ny) / GRAIN_CELLS
          const distance = Math.hypot(u - px, v - py)
          if (distance < nearest) {
            second = nearest
            nearest = distance
            owner = cell
          } else if (distance < second) {
            second = distance
          }
        }
      }
      // Стык граней — узкая тёмная кромка
      const seam = Math.min(1, ((second - nearest) * GRAIN_SIZE) / 2.5)
      const offset = (y * GRAIN_SIZE + x) * 4
      data[offset] = Math.round((owner.slopeX * 0.5 + 0.5) * 255)
      data[offset + 1] = Math.round((owner.slopeY * 0.5 + 0.5) * 255)
      data[offset + 2] = Math.round(owner.sparkle * seam * 255)
      data[offset + 3] = Math.round(owner.shade * (0.84 + 0.16 * seam) * 255)
    }
  }
  return data
}

// --- Сборка -------------------------------------------------------------------------------

export interface FrostField {
  // «Приход» инея, один канал, строки снизу вверх (строка 0 — дно банки)
  arrival: Uint8Array
  width: number
  height: number
  // Зерно кристаллов RGBA GRAIN_SIZE × GRAIN_SIZE
  grain: Uint8Array
}

export function buildFrostField(seeds: FrostSeed[]): FrostField {
  const ctx = createContext2d(TEXTURE_WIDTH, TEXTURE_HEIGHT)
  paintBase(ctx)
  paintSegments(ctx, collectFerns())
  paintSeeds(ctx, seeds)

  const rgba = ctx.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data
  const arrival = new Uint8Array(TEXTURE_WIDTH * TEXTURE_HEIGHT)
  for (let y = 0; y < TEXTURE_HEIGHT; y++) {
    const source = y * TEXTURE_WIDTH * 4
    const target = (TEXTURE_HEIGHT - 1 - y) * TEXTURE_WIDTH
    for (let x = 0; x < TEXTURE_WIDTH; x++) arrival[target + x] = rgba[source + x * 4]
  }
  return { arrival, width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT, grain: buildGrain() }
}
