import { createRandom, randomRange } from '../../utils/random'
import { LAYOUT, PANEL_CENTER, TEXTURE_HEIGHT, TEXTURE_WIDTH, createContext2d, px, uToX, wrapAround } from '../label/canvas'

// Капли конденсата на банке — отдельно от этикетки. Раньше они были
// «запечены» в её слои (цвет, материал, рельеф), и банку нельзя было ни
// высушить, ни остудить. Теперь это одна общая для всех банок текстура —
// «поле капель», а саму каплю рисует шейдер (coldSurface.ts): она зарождается
// точкой и растёт, когда растёт «влажность», и тает обратно.
//
// Поле капель, RGBA по пикселям развёртки (та же развёртка, что у этикетки):
//  - R, G — где пиксель относительно центра своей капли, в её радиусах
//    (p = (x − cx) / r, y — с учётом вытянутости). Внутри капли |p| < 1;
//  - B — «рождение» капли 0..1: при какой влажности она начинает расти
//    (255 — капли нет);
//  - A — мокрая дорожка: 0 — нет, иначе место вдоль дорожки (сверху вниз),
//    по нему шейдер «прокатывает» каплю и открывает след.
//
// Почему координаты, а не готовая картинка капли: из p шейдер строит купол
// любого размера — капля растёт, оставаясь круглой выпуклой линзой, а не
// «обрезком» большой капли. p внутри капли линейно, поэтому линейная
// фильтрация текстуры восстанавливает его точно; мип-уровни поле не
// использует — усреднение координат соседних капель дало бы мусор.

// --- Раскладка капель -----------------------------------------------------------------

export interface Droplet {
  // Центр, px развёртки (как на холсте этикетки: y растёт вниз)
  x: number
  y: number
  r: number
  // Вытянутость по вертикали: крупные капли под своим весом «оседают»
  stretch: number
  // При какой влажности 0..1 капля начинает расти
  birth: number
}

const MAX_RADIUS = 24
// Зазор между краями соседних капель, px. У каждой капли в поле есть «зона»
// из пикселей вокруг неё (BAND); при зазоре меньше 4 px зоны соседних капель
// смешались бы при фильтрации текстуры, и между ними вспыхивали бы ложные капли
const GAP = 4
// Ячейка сетки для поиска соседей: не меньше двух самых крупных капель с зазором
const CELL = 72
// Сколько «влажности» занимает рост одной капли от точки до полного размера —
// этим же числом пользуется шейдер
export const DROPLET_GROW = 0.3

// Размер капли на холсте: мелких много, крупных единицы
function dropletRadius(random: () => number): number {
  return 3 + (MAX_RADIUS - 3) * random() ** 2.8
}

// Скопления: вода садится пятнами — где-то густо, где-то почти сухо.
// Низкочастотный шум, замкнутый по горизонтали (развёртка — цилиндр).
function createClusterNoise(seed: number) {
  const random = createRandom(seed)
  const columns = 7
  const rows = 5
  const grid = Float32Array.from({ length: columns * rows }, () => random())
  const at = (cx: number, cy: number) => grid[Math.min(rows - 1, Math.max(0, cy)) * columns + (((cx % columns) + columns) % columns)]
  return (x: number, y: number) => {
    const gx = (x / TEXTURE_WIDTH) * columns
    const gy = (y / TEXTURE_HEIGHT) * (rows - 1)
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

const clusters = createClusterNoise(313)

// Плотность капель 0..1: скопления, внизу гуще (вода стекает и собирается),
// на горлышке меньше, на лицевой панели реже — надписи должны читаться
function density(x: number, y: number): number {
  const heightUnits = (TEXTURE_HEIGHT - y) / px(1)
  let value = 0.25 + 0.85 * clusters(x, y)
  if (heightUnits < 0.7) value += 0.25
  if (heightUnits > LAYOUT.printTop) value *= 0.6
  const frontX = uToX(PANEL_CENTER.front)
  if (Math.abs(x - frontX) < px(0.5) && heightUnits > 0.9) value *= 0.62
  return Math.min(1, value)
}

// Раскладка без наложений: сетка ячеек ускоряет проверку соседей. Капля
// занимает эллипс, поэтому соседей проверяем по большей полуоси
function scatterDroplets(random: () => number): Droplet[] {
  const columns = Math.ceil(TEXTURE_WIDTH / CELL)
  const rows = Math.ceil(TEXTURE_HEIGHT / CELL)
  const grid: Droplet[][] = Array.from({ length: columns * rows }, () => [])
  const droplets: Droplet[] = []

  for (let attempt = 0; attempt < 6400 && droplets.length < 1500; attempt++) {
    const x = random() * TEXTURE_WIDTH
    const y = random() * TEXTURE_HEIGHT
    if (random() > density(x, y)) continue
    const r = dropletRadius(random)
    const stretch = 1 + Math.min(0.3, (r / 22) * 0.3) + randomRange(random, 0, 0.06)
    const reach = r * stretch
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)
    let free = true
    for (let dy = -1; dy <= 1 && free; dy++) {
      for (let dx = -1; dx <= 1 && free; dx++) {
        const nx = (cx + dx + columns) % columns
        const ny = cy + dy
        if (ny < 0 || ny >= rows) continue
        for (const other of grid[ny * columns + nx]) {
          let distanceX = Math.abs(other.x - x)
          if (distanceX > TEXTURE_WIDTH / 2) distanceX = TEXTURE_WIDTH - distanceX
          if (Math.hypot(distanceX, other.y - y) < other.r * other.stretch + reach + GAP) {
            free = false
            break
          }
        }
      }
    }
    if (!free) continue
    const droplet = { x, y, r, stretch, birth: 0 }
    droplets.push(droplet)
    grid[cy * columns + cx].push(droplet)
  }
  return droplets
}

// Кто раньше: мелкие капли появляются первыми (сначала банка «запотевает»
// россыпью точек), крупные — чуть позже. Всем хватает времени дорасти до
// полного размера к влажности 1
function assignBirths(droplets: Droplet[], random: () => number) {
  for (const drop of droplets) {
    drop.birth = randomRange(random, 0, 0.5) + (drop.r / MAX_RADIUS) * 0.2
  }
}

// --- Мокрые дорожки -------------------------------------------------------------------

// Крупная капля скатилась вниз и оставила за собой след. top/bottom — начало
// и конец следа на холсте: по ним шейдер открывает дорожку сверху вниз
export interface Trail {
  path: Path2D
  top: number
  bottom: number
  beads: Droplet[]
}

function createTrail(random: () => number, drop: Droplet): Trail {
  const length = randomRange(random, 90, 280)
  const width = drop.r * randomRange(random, 0.45, 0.7)
  const path = new Path2D()
  const points: [number, number][] = []
  let x = drop.x
  const bottom = drop.y - drop.r * 0.6
  for (let t = 0; t <= 1.0001; t += 0.05) {
    x += randomRange(random, -1.6, 1.6)
    points.push([x, bottom - t * length])
  }
  // Контур дорожки: шире у капли, сходит на нет вверху
  points.forEach(([px0, py0], i) => {
    const w = (width / 2) * (1 - i / points.length) ** 0.6
    if (i === 0) path.moveTo(px0 - w, py0)
    else path.lineTo(px0 - w, py0)
  })
  for (let i = points.length - 1; i >= 0; i--) {
    const [px0, py0] = points[i]
    path.lineTo(px0 + (width / 2) * (1 - i / points.length) ** 0.6, py0)
  }
  path.closePath()
  // В дорожке остаются крошечные бусинки воды — они появляются последними
  const beads: Droplet[] = []
  const beadCount = Math.floor(randomRange(random, 2, 6))
  for (let i = 0; i < beadCount; i++) {
    const [bx, by] = points[Math.floor(randomRange(random, 2, points.length - 1))]
    beads.push({ x: bx, y: by, r: randomRange(random, 2.2, 4), stretch: 1.1, birth: 0.68 })
  }
  return { path, top: bottom - length, bottom, beads }
}

// Значение канала A у нижнего конца дорожки (у верхнего — 1)
export const TRAIL_BOTTOM = 0.2

// Дорожки — в канал A: вертикальный градиент от 1 (верх следа) до
// TRAIL_BOTTOM (капля внизу). Шейдер читает из него место вдоль следа
// s = 0..1 и открывает дорожку там, где s меньше текущего «проката»
function rasterizeTrails(trails: Trail[]): Uint8ClampedArray {
  const ctx = createContext2d(TEXTURE_WIDTH, TEXTURE_HEIGHT)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  ctx.globalCompositeOperation = 'lighten'
  for (const trail of trails) {
    const gradient = ctx.createLinearGradient(0, trail.top, 0, trail.bottom)
    gradient.addColorStop(0, 'rgb(255, 255, 255)')
    gradient.addColorStop(1, `rgb(${TRAIL_BOTTOM * 255}, 0, 0)`)
    ctx.fillStyle = gradient
    wrapAround(ctx, () => ctx.fill(trail.path))
  }
  return ctx.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data
}

// --- Поле капель ----------------------------------------------------------------------

// Координаты p кодируются в байт в диапазоне ±P_RANGE радиусов
export const P_RANGE = 1.5
// Сколько пикселей за краем капли ещё хранят её «рождение» — запас под
// сглаживание края. Дальше, до BAND, — только координаты (без рождения):
// так соседние пиксели на краю капли всегда относятся к одной и той же капле
const MARGIN = 0.5
const BAND = 2.5

const encode = (value: number) => Math.max(0, Math.min(255, Math.round(((value + P_RANGE) / (2 * P_RANGE)) * 255)))

export interface DropletField {
  // RGBA, строки снизу вверх (строка 0 — дно банки): так текстура ложится
  // на развёртку без переворота
  data: Uint8Array
  width: number
  height: number
}

// Каждая капля записывает координаты в пиксели вокруг себя; пиксель
// достаётся ближайшей по краю капле (как ячейки Вороного). Рождение пишется
// только в саму каплю и полпикселя вокруг — всё остальное «без капли»
function rasterizeDroplets(droplets: Droplet[], data: Uint8Array) {
  const width = TEXTURE_WIDTH
  const height = TEXTURE_HEIGHT
  const best = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY)
  for (const drop of droplets) {
    const reach = drop.r * drop.stretch + BAND
    const x0 = Math.floor(drop.x - reach)
    const x1 = Math.ceil(drop.x + reach)
    const y0 = Math.max(0, Math.floor(drop.y - reach))
    const y1 = Math.min(height - 1, Math.ceil(drop.y + reach))
    const birth = Math.round(drop.birth * 255)
    for (let ty = y0; ty <= y1; ty++) {
      // Холст: y вниз; текстура: v вверх — знак у p.y обратный
      const py = -(ty + 0.5 - drop.y) / (drop.r * drop.stretch)
      const row = (height - 1 - ty) * width
      for (let tx = x0; tx <= x1; tx++) {
        const pxv = (tx + 0.5 - drop.x) / drop.r
        const edge = (Math.hypot(pxv, py) - 1) * drop.r
        if (edge > BAND) continue
        const index = row + (((tx % width) + width) % width)
        if (edge >= best[index]) continue
        best[index] = edge
        const offset = index * 4
        data[offset] = encode(pxv)
        data[offset + 1] = encode(py)
        data[offset + 2] = edge <= MARGIN ? birth : 255
      }
    }
  }
}

// Раскладка капель и дорожек — общая для поля капель и для карты инея
// (вокруг крупных капель иней расходится пятнами, frost.ts)
export interface DropletLayout {
  droplets: Droplet[]
  trails: Trail[]
}

export function createDropletLayout(): DropletLayout {
  const random = createRandom(909)
  const droplets = scatterDroplets(random)
  assignBirths(droplets, createRandom(4242))
  // Дорожки — от самых крупных капель
  const trails = droplets
    .filter((drop) => drop.r > 13)
    .slice(0, 14)
    .map((drop) => createTrail(random, drop))
  for (const trail of trails) droplets.push(...trail.beads)
  return { droplets, trails }
}

export function buildDropletField({ droplets, trails }: DropletLayout): DropletField {
  const width = TEXTURE_WIDTH
  const height = TEXTURE_HEIGHT
  const data = new Uint8Array(width * height * 4)
  // По умолчанию: p = 0, капли нет, дорожки нет
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 128
    data[offset + 1] = 128
    data[offset + 2] = 255
  }
  rasterizeDroplets(droplets, data)

  const trailMask = rasterizeTrails(trails)
  for (let y = 0; y < height; y++) {
    const source = y * width * 4
    const target = (height - 1 - y) * width * 4
    for (let x = 0; x < width; x++) data[target + x * 4 + 3] = trailMask[source + x * 4]
  }
  return { data, width, height }
}
