import { createRandom, randomRange } from '../../utils/random'
import { LAYOUT, PANEL_CENTER, SURFACE, TEXTURE_HEIGHT, TEXTURE_WIDTH, paint, px, toCanvasY, uToX, wrapAround, type Layers } from './canvas'

// Конденсат и иней на холодной банке. Банка только что из холодильника:
// по всей поверхности — капли воды (внизу гуще, где вода собирается),
// несколько капель уже скатились и оставили мокрые дорожки, а на металле
// горлышка и дна — иней, который чуть заходит на край печати.
//
// Капля живёт сразу в трёх слоях:
//  - рельеф: выпуклый купол — из него карта нормалей даёт блики и "линзу";
//  - материал: гладкая неметаллическая вода поверх краски;
//  - цвет: едва заметная тёмная кайма по краю и яркая точка блика — так
//    капля читается даже там, где на неё не падает отражение.

interface Droplet {
  x: number
  y: number
  r: number
  // Вытянутость по вертикали: крупные капли под своим весом "оседают"
  stretch: number
}

// Размер капли на холсте: мелких много, крупных единицы
function dropletRadius(random: () => number): number {
  return 3 + 21 * random() ** 2.8
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

// Раскладка без наложений: сетка ячеек ускоряет проверку соседей
function scatterDroplets(random: () => number): Droplet[] {
  const cell = 48
  const columns = Math.ceil(TEXTURE_WIDTH / cell)
  const rows = Math.ceil(TEXTURE_HEIGHT / cell)
  const grid: Droplet[][] = Array.from({ length: columns * rows }, () => [])
  const droplets: Droplet[] = []

  for (let attempt = 0; attempt < 5200 && droplets.length < 1500; attempt++) {
    const x = random() * TEXTURE_WIDTH
    const y = random() * TEXTURE_HEIGHT
    if (random() > density(x, y)) continue
    const r = dropletRadius(random)
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    let free = true
    for (let dy = -1; dy <= 1 && free; dy++) {
      for (let dx = -1; dx <= 1 && free; dx++) {
        const nx = (cx + dx + columns) % columns
        const ny = cy + dy
        if (ny < 0 || ny >= rows) continue
        for (const other of grid[ny * columns + nx]) {
          let distanceX = Math.abs(other.x - x)
          if (distanceX > TEXTURE_WIDTH / 2) distanceX = TEXTURE_WIDTH - distanceX
          if (Math.hypot(distanceX, other.y - y) < other.r + r + 3) {
            free = false
            break
          }
        }
      }
    }
    if (!free) continue
    const droplet = { x, y, r, stretch: 1 + Math.min(0.3, (r / 22) * 0.3) + randomRange(random, 0, 0.06) }
    droplets.push(droplet)
    grid[cy * columns + cx].push(droplet)
  }
  return droplets
}

// Мокрые дорожки: крупная капля скатилась вниз и оставила за собой след
interface Trail {
  path: Path2D
  beads: Droplet[]
}

function createTrail(random: () => number, drop: Droplet): Trail {
  const length = randomRange(random, 90, 280)
  const width = drop.r * randomRange(random, 0.45, 0.7)
  const path = new Path2D()
  const points: [number, number][] = []
  let x = drop.x
  for (let t = 0; t <= 1.0001; t += 0.05) {
    x += randomRange(random, -1.6, 1.6)
    points.push([x, drop.y - drop.r * 0.6 - t * length])
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
  // В дорожке остаются крошечные бусинки воды
  const beads: Droplet[] = []
  const beadCount = Math.floor(randomRange(random, 2, 6))
  for (let i = 0; i < beadCount; i++) {
    const [bx, by] = points[Math.floor(randomRange(random, 2, points.length - 1))]
    beads.push({ x: bx, y: by, r: randomRange(random, 2.2, 4), stretch: 1.1 })
  }
  return { path, beads }
}

function domePath(drop: Droplet): Path2D {
  const path = new Path2D()
  path.ellipse(drop.x, drop.y, drop.r, drop.r * drop.stretch, 0, 0, Math.PI * 2)
  return path
}

function paintDroplets(layers: Layers, droplets: Droplet[]) {
  // Материал: вода
  paint(layers, { surface: SURFACE.water }, (ctx, kind) => {
    if (kind !== 'surface') return
    wrapAround(ctx, () => {
      for (const drop of droplets) ctx.fill(domePath(drop))
    })
  })

  // Рельеф: купол, центр чуть смещён вниз — вода стекает к низу капли
  const { height } = layers
  height.save()
  height.globalCompositeOperation = 'lighter'
  wrapAround(height, () => {
    for (const drop of droplets) {
      const amplitude = Math.round(255 * (0.55 + 0.45 * Math.min(1, drop.r / 20)))
      const gradient = height.createRadialGradient(drop.x, drop.y + drop.r * 0.25, 0, drop.x, drop.y, drop.r * drop.stretch)
      const level = (k: number) => `rgb(${Math.round(amplitude * k)}, ${Math.round(amplitude * k)}, ${Math.round(amplitude * k)})`
      gradient.addColorStop(0, level(1))
      gradient.addColorStop(0.5, level(0.86))
      gradient.addColorStop(0.75, level(0.64))
      gradient.addColorStop(0.92, level(0.36))
      gradient.addColorStop(1, level(0))
      height.fillStyle = gradient
      height.fill(domePath(drop))
    }
  })
  height.restore()

  // Цвет: кайма по краю и блики
  const { color } = layers
  color.save()
  wrapAround(color, () => {
    for (const drop of droplets) {
      const path = domePath(drop)
      const lens = color.createRadialGradient(drop.x, drop.y, drop.r * 0.3, drop.x, drop.y, drop.r * drop.stretch)
      lens.addColorStop(0, 'rgba(90, 120, 150, 0)')
      lens.addColorStop(0.78, 'rgba(70, 105, 140, 0.07)')
      lens.addColorStop(1, 'rgba(40, 70, 100, 0.22)')
      color.fillStyle = lens
      color.fill(path)
      if (drop.r < 4.5) continue
      // Блик сверху-слева и светлое "донышко" снизу — вода фокусирует свет
      color.fillStyle = 'rgba(255, 255, 255, 0.9)'
      color.beginPath()
      color.ellipse(drop.x - drop.r * 0.34, drop.y - drop.r * 0.42, drop.r * 0.2, drop.r * 0.14, -0.6, 0, Math.PI * 2)
      color.fill()
      color.fillStyle = 'rgba(255, 255, 255, 0.35)'
      color.beginPath()
      color.ellipse(drop.x + drop.r * 0.1, drop.y + drop.r * 0.55, drop.r * 0.42, drop.r * 0.16, 0, 0, Math.PI * 2)
      color.fill()
    }
  })
  color.restore()
}

function paintTrails(layers: Layers, trails: Trail[]) {
  paint(layers, { surface: SURFACE.water, height: 0.22 }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = 'rgba(210, 228, 240, 0.28)'
    wrapAround(ctx, () => {
      for (const trail of trails) ctx.fill(trail.path)
    })
  })
  paintDroplets(
    layers,
    trails.flatMap((trail) => trail.beads),
  )
}

// Иней: россыпь матовых кристалликов и белёсая дымка на металле горлышка и
// каблука, с языками, заходящими на край печати
function paintFrost(layers: Layers) {
  const random = createRandom(1717)
  const bands = [
    // Каблук снизу: иней ползёт вверх от дна
    { from: TEXTURE_HEIGHT, to: toCanvasY(LAYOUT.printBottom + 0.1), direction: -1 },
    // Горлышко: иней сползает вниз от закатки
    { from: 0, to: toCanvasY(LAYOUT.printTop - 0.06), direction: 1 },
  ]

  for (const band of bands) {
    const span = Math.abs(band.to - band.from)
    // Дымка: мягкий белый градиент от края внутрь
    // Материал инея тоже затухает градиентом: у края — матовый, дальше —
    // исходная поверхность
    const [roughness, metalness] = SURFACE.frost
    const frostSurface = `${255}, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)}`
    paint(layers, { surface: SURFACE.frost }, (ctx, kind) => {
      const gradient = ctx.createLinearGradient(0, band.from, 0, band.to)
      const tone = kind === 'color' ? '246, 250, 253' : frostSurface
      gradient.addColorStop(0, `rgba(${tone}, 0.55)`)
      gradient.addColorStop(0.6, `rgba(${tone}, 0.25)`)
      gradient.addColorStop(1, `rgba(${tone}, 0)`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, Math.min(band.from, band.to), TEXTURE_WIDTH, span)
    })

    // Кристаллики: больше у края, реже вглубь
    const specks: [number, number, number][] = []
    for (let i = 0; i < 9000; i++) {
      const t = random() ** 2.2
      const y = band.from + band.direction * t * span * 1.25
      specks.push([random() * TEXTURE_WIDTH, y, randomRange(random, 0.6, 2.1)])
    }
    paint(layers, { surface: SURFACE.frost, height: 0.25 }, (ctx, kind) => {
      if (kind === 'color') ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
      ctx.beginPath()
      for (const [x, y, r] of specks) {
        ctx.moveTo(x + r, y)
        ctx.arc(x, y, r, 0, Math.PI * 2)
      }
      ctx.fill()
    })
  }
}

export function paintCondensation(layers: Layers) {
  const random = createRandom(909)
  paintFrost(layers)
  const droplets = scatterDroplets(random)
  // Дорожки — от самых крупных капель
  const trails = droplets
    .filter((drop) => drop.r > 13)
    .slice(0, 14)
    .map((drop) => createTrail(random, drop))
  paintTrails(layers, trails)
  paintDroplets(layers, droplets)
}
