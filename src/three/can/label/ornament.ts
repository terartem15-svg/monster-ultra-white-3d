import { MathUtils } from 'three'
import { createRandom, randomRange } from '../../utils/random'
import { INK, LAYOUT, PANEL_CENTER, SURFACE, TEXTURE_WIDTH, paint, toCanvasY, uToX, wrapAround, type Layers } from './canvas'

// Фоновый орнамент банки в стиле Monster Ultra: серебристые вьющиеся лозы,
// закрученные в спирали, с тонкими побегами и листиками, пятна-брызги краски
// и крупные волнообразные завитки с белыми бликами вдоль верхнего и нижнего
// края печати. Орнамент — металлизированная краска с лёгким тиснением: при
// повороте банки он вспыхивает серебром.
//
// Каждая фигура сначала строится как Path2D, а потом одинаково заливается
// во все слои (цвет, материал, рельеф) — узор совпадает пиксель в пиксель.

const TAU = Math.PI * 2

type Point = [number, number]

// Сужающийся мазок: контур строится по средней линии и профилю толщины
// width(t), t = 0..1 вдоль линии, и заливается целиком
function taperedPath(points: Point[], width: (t: number) => number): Path2D {
  const left: Point[] = []
  const right: Point[] = []
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)]
    const [x1, y1] = points[Math.min(points.length - 1, i + 1)]
    const length = Math.hypot(x1 - x0, y1 - y0) || 1
    const nx = -(y1 - y0) / length
    const ny = (x1 - x0) / length
    const half = width(i / (points.length - 1)) / 2
    const [x, y] = points[i]
    left.push([x + nx * half, y + ny * half])
    right.push([x - nx * half, y - ny * half])
  }
  const path = new Path2D()
  path.moveTo(left[0][0], left[0][1])
  for (const [x, y] of left) path.lineTo(x, y)
  for (let i = right.length - 1; i >= 0; i--) path.lineTo(right[i][0], right[i][1])
  path.closePath()
  return path
}

// Листик-капля: основание в точке (x, y), острый кончик по направлению angle
function leafPath(x: number, y: number, angle: number, length: number, width: number): Path2D {
  const tipX = x + Math.cos(angle) * length
  const tipY = y + Math.sin(angle) * length
  const nx = -Math.sin(angle) * width
  const ny = Math.cos(angle) * width
  const midX = x + Math.cos(angle) * length * 0.45
  const midY = y + Math.sin(angle) * length * 0.45
  const path = new Path2D()
  path.moveTo(x, y)
  path.quadraticCurveTo(midX + nx, midY + ny, tipX, tipY)
  path.quadraticCurveTo(midX - nx, midY - ny, x, y)
  path.closePath()
  return path
}

// --- Лозы ------------------------------------------------------------------------------

interface VineSpec {
  x: number
  y: number
  angle: number
  length: number
  width: number
  curl: 1 | -1
  depth: number
}

// Растит лозу: плавный стебель, который на конце закручивается в спираль
// (кривизна нарастает — как у усика винограда), от стебля — побеги
// поменьше, закрученные в другую сторону, и редкие листики
function growVine(random: () => number, spec: VineSpec, strokes: Path2D[], leaves: Path2D[]) {
  const step = 5
  const points: Point[] = []
  let { x, y, angle } = spec
  let bend = randomRange(random, -0.012, 0.012)
  const stemSteps = Math.max(5, Math.round(spec.length / step))
  for (let i = 0; i < stemSteps; i++) {
    points.push([x, y])
    bend = MathUtils.clamp(bend + randomRange(random, -0.004, 0.004), -0.028, 0.028)
    angle += bend
    x += Math.cos(angle) * step
    y += Math.sin(angle) * step
  }

  // Спираль на конце побега
  let curvature = 0.045 * spec.curl
  let segment = step
  const turns = randomRange(random, 1.2, 2.1) * TAU
  let turned = 0
  while (Math.abs(turned) < turns && segment > 0.7) {
    points.push([x, y])
    angle += curvature
    turned += curvature
    curvature *= 1.032
    segment *= 0.986
    x += Math.cos(angle) * segment
    y += Math.sin(angle) * segment
  }

  // Толщина: тонкое начало, полная толщина в первой трети, к центру
  // спирали — волосок
  strokes.push(
    taperedPath(points, (t) => {
      const grow = MathUtils.smoothstep(t, 0, 0.12)
      const fade = 1 - 0.88 * MathUtils.smoothstep(t, 0.2, 1)
      return spec.width * (0.3 + 0.7 * grow) * fade
    }),
  )

  // Листики вдоль стебля
  const leafCount = Math.floor(random() * 3)
  for (let i = 0; i < leafCount; i++) {
    const at = Math.floor(randomRange(random, 0.2, 0.75) * stemSteps)
    const [lx, ly] = points[at]
    const [nx, ny] = points[at + 1]
    const direction = Math.atan2(ny - ly, nx - lx) + (random() > 0.5 ? 1 : -1) * randomRange(random, 0.6, 1.1)
    leaves.push(leafPath(lx, ly, direction, spec.width * randomRange(random, 2.4, 3.6), spec.width * randomRange(random, 0.7, 1.1)))
  }

  // Побеги
  if (spec.depth <= 0) return
  const branches = 1 + Math.floor(random() * 3)
  for (let b = 0; b < branches; b++) {
    const at = Math.floor(randomRange(random, 0.2, 0.85) * stemSteps)
    const [bx, by] = points[at]
    const [nx, ny] = points[at + 1]
    const direction = Math.atan2(ny - by, nx - bx)
    const side = random() > 0.5 ? 1 : -1
    growVine(
      random,
      {
        x: bx,
        y: by,
        angle: direction + side * randomRange(random, 0.45, 1.05),
        length: spec.length * randomRange(random, 0.22, 0.45),
        width: spec.width * 0.55,
        curl: side === 1 ? 1 : -1,
        depth: spec.depth - 1,
      },
      strokes,
      leaves,
    )
  }
}

// --- Брызги ------------------------------------------------------------------------------

// Пятно-клякса неровного контура и россыпь капель вокруг — "гранж" фона
// оригинальной этикетки Ultra
function splatterPath(random: () => number, cx: number, cy: number, size: number): Path2D {
  const path = new Path2D()
  const count = 22
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * TAU
    const r = size * randomRange(random, 0.62, 1.18)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.closePath()
  const dots = 14 + Math.floor(random() * 18)
  for (let i = 0; i < dots; i++) {
    const a = random() * TAU
    const distance = size * randomRange(random, 1.2, 3.6)
    const r = size * randomRange(random, 0.05, 0.24)
    path.moveTo(cx + Math.cos(a) * distance + r, cy + Math.sin(a) * distance)
    path.ellipse(cx + Math.cos(a) * distance, cy + Math.sin(a) * distance, r, r * randomRange(random, 0.55, 1), a, 0, TAU)
  }
  return path
}

// --- Волны-завитки -------------------------------------------------------------------------

// Крупный завиток-волна, как у верхнего края настоящей банки: широкий
// серебряный мазок с белыми бликами внутри — будто гравировка на металле
interface Wave {
  body: Path2D
  highlights: Path2D[]
}

function wavePath(random: () => number, x: number, y: number, angle: number, length: number, width: number): Wave {
  const points: Point[] = []
  const curl = random() > 0.5 ? 1 : -1
  let a = angle
  let px = x
  let py = y
  const steps = Math.round(length / 6)
  for (let i = 0; i < steps; i++) {
    points.push([px, py])
    // Волна: изгиб по синусу, на конце — закручивание
    const t = i / steps
    a += curl * (Math.sin(t * Math.PI * 1.6) * 0.035 + (t > 0.7 ? (t - 0.7) * 0.4 : 0))
    px += Math.cos(a) * 6
    py += Math.sin(a) * 6
  }
  const body = taperedPath(points, (t) => width * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 + 1)
  // Блики — тонкие линии внутри мазка, чуть смещённые от середины
  const highlights = [0.18, -0.12].map((offset) =>
    taperedPath(
      points.map(([hx, hy], i) => {
        const [x0, y0] = points[Math.max(0, i - 1)]
        const [x1, y1] = points[Math.min(points.length - 1, i + 1)]
        const l = Math.hypot(x1 - x0, y1 - y0) || 1
        return [hx - ((y1 - y0) / l) * width * offset, hy + ((x1 - x0) / l) * width * offset] as Point
      }),
      (t) => 2.6 * Math.sin(Math.PI * t) ** 0.8,
    ),
  )
  return { body, highlights }
}

// --- Сборка орнамента ------------------------------------------------------------------------

export function paintOrnament(layers: Layers) {
  const random = createRandom(2012)
  const top = toCanvasY(LAYOUT.printTop)
  const bottom = toCanvasY(LAYOUT.printBottom)
  const frontX = uToX(PANEL_CENTER.front)

  // Брызги — самый нижний слой
  const splatters: Path2D[] = []
  for (let i = 0; i < 16; i++) {
    const x = randomRange(random, 0, TEXTURE_WIDTH)
    const y = randomRange(random, top + 60, bottom - 60)
    splatters.push(splatterPath(random, x, y, randomRange(random, 10, 26)))
  }
  paint(layers, { surface: [0.3, 0.45], height: 0.08 }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = 'rgba(178, 190, 202, 0.38)'
    wrapAround(ctx, () => {
      for (const path of splatters) ctx.fill(path)
    })
  })

  // Лозы: зёрна по неровной сетке, спереди у когтя — реже
  const strokes: Path2D[] = []
  const leaves: Path2D[] = []
  const columns = 9
  const rows = 4
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const x = ((c + randomRange(random, 0.1, 0.9)) / columns) * TEXTURE_WIDTH
      const y = top + ((r + randomRange(random, 0.15, 0.85)) / rows) * (bottom - top)
      if (Math.abs(x - frontX) < 250 && random() < 0.75) continue
      growVine(
        random,
        {
          x,
          y,
          angle: randomRange(random, 0, TAU),
          length: randomRange(random, 130, 300),
          width: randomRange(random, 7, 13),
          curl: random() > 0.5 ? 1 : -1,
          depth: 2,
        },
        strokes,
        leaves,
      )
    }
  }
  paint(layers, { surface: SURFACE.foil, height: 0.3 }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = 'rgba(138, 155, 172, 0.66)'
    wrapAround(ctx, () => {
      for (const path of strokes) ctx.fill(path)
      for (const path of leaves) ctx.fill(path)
    })
  })

  // Волны-завитки вдоль верхнего и нижнего края печати
  const waves: Wave[] = []
  for (let i = 0; i < 16; i++) {
    const atTop = i % 2 === 0
    const x = ((i / 16) * TEXTURE_WIDTH + randomRange(random, -60, 60) + TEXTURE_WIDTH) % TEXTURE_WIDTH
    const y = atTop ? top + randomRange(random, 40, 150) : bottom - randomRange(random, 40, 120)
    const angle = (atTop ? 0.25 : -0.25) + (random() > 0.5 ? 0 : Math.PI) + randomRange(random, -0.3, 0.3)
    waves.push(wavePath(random, x, y, angle, randomRange(random, 160, 280), randomRange(random, 18, 30)))
  }
  paint(layers, { surface: SURFACE.foil, height: 0.4 }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = INK.silverSoft
    wrapAround(ctx, () => {
      for (const wave of waves) ctx.fill(wave.body)
    })
  })
  paint(layers, { surface: [0.18, 0.3] }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = INK.highlight
    wrapAround(ctx, () => {
      for (const wave of waves) for (const path of wave.highlights) ctx.fill(path)
    })
  })
}

// Чистая подложка под текстом: мягкое белое пятно с растушёванным краем,
// под которым орнамент тихо гаснет — как на настоящей банке, где история и
// надписи лежат на светлом поле. Растушёвка — стопка скруглённых
// прямоугольников, каждый чуть меньше и плотнее предыдущего: выглядит как
// размытие, но без дорогого фильтра blur на весь холст.
const CLEARING_STEPS = 8
const CLEARING_FEATHER = 36

export function paintClearing(layers: Layers, x: number, y: number, width: number, height: number, strength = 0.9) {
  paint(layers, { surface: SURFACE.paint, flatten: true }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = '#f9fbfd'
    // Итоговая плотность в центре — strength: каждый слой добавляет свою долю
    ctx.globalAlpha = 1 - (1 - strength) ** (1 / CLEARING_STEPS)
    for (let step = 0; step < CLEARING_STEPS; step++) {
      const inset = CLEARING_FEATHER * (1 - step / CLEARING_STEPS) - CLEARING_FEATHER / 2
      ctx.beginPath()
      ctx.roundRect(x + inset, y + inset, width - inset * 2, height - inset * 2, 40)
      ctx.fill()
    }
  })
}
