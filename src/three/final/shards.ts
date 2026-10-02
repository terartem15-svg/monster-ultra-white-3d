import { BufferGeometry, Float32BufferAttribute } from 'three'
import { createRandom, randomRange } from '../utils/random'

// Осколки инея. Стекло финального экрана заранее разрезано на куски —
// ячейки Вороного вокруг точки удара: мелкие у удара и крупнее к краям, по
// кольцам, как у настоящего разбитого стекла (радиальные и кольцевые
// трещины). Пока стекло целое, куски лежат встык в одной плоскости и
// выглядят одним листом; трещины по их краям рисует шейдер, когда до них
// доходит фронт, а потом каждый кусок падает сам (вершинный шейдер,
// frostMaterial.ts).
//
// Координаты вершин — доли экрана (u, v; v вверх), с небольшим запасом за
// край кадра: экран бывает любой пропорции, а в мировые единицы их переводит
// шейдер. Геометрия без индексов — у каждого треугольника свои атрибуты:
//  - aEdge: 1 в центре куска, 0 на его краю — по нему рисуется трещина;
//  - aOpen: 1, если край треугольника — трещина, 0 — если это край экрана;
//  - aShard: центр куска (u, v) и два случайных числа куска (ось и скорость
//    вращения, разлёт).

// Запас за краем кадра, доли экрана: падающий кусок не открывает пустую кромку
export const SHARD_MARGIN = 0.02

// Кольца зёрен вокруг удара: радиус (в высотах экрана) и число зёрен
const RINGS: [number, number][] = [
  [0.05, 5],
  [0.11, 7],
  [0.19, 9],
  [0.3, 11],
  [0.44, 12],
  [0.62, 14],
  [0.84, 16],
  [1.1, 18],
  [1.42, 20],
]
// Немного зёрен вразброс — чтобы кольца не читались циркулем
const SCATTER = 10

interface Point {
  x: number
  y: number
}

// Отсечение выпуклого многоугольника полуплоскостью n·p ≤ c
function clip(polygon: Point[], nx: number, ny: number, c: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const da = nx * a.x + ny * a.y - c
    const db = nx * b.x + ny * b.y - c
    if (da <= 0) out.push(a)
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

function centroid(polygon: Point[]): Point & { area: number } {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  area /= 2
  if (Math.abs(area) < 1e-9) return { x: polygon[0].x, y: polygon[0].y, area: 0 }
  return { x: cx / (6 * area), y: cy / (6 * area), area: Math.abs(area) }
}

// Стекло, разрезанное вокруг точки удара origin (доли экрана, v вверх);
// aspect — ширина экрана к высоте. Внутри всё считается в «высотах экрана»
// (x умножен на aspect), чтобы кольца были кругами, а не эллипсами
export function buildShardGeometry(origin: Point, aspect: number, seed: number): BufferGeometry {
  const random = createRandom(seed)
  const left = -SHARD_MARGIN * aspect
  const right = (1 + SHARD_MARGIN) * aspect
  const bottom = -SHARD_MARGIN
  const top = 1 + SHARD_MARGIN
  const ox = origin.x * aspect
  const oy = origin.y

  const seeds: Point[] = []
  for (const [radius, count] of RINGS) {
    const turn = randomRange(random, 0, Math.PI * 2)
    for (let i = 0; i < count; i++) {
      const angle = turn + ((i + randomRange(random, -0.3, 0.3)) / count) * Math.PI * 2
      const r = radius * randomRange(random, 0.82, 1.18)
      seeds.push({ x: ox + Math.cos(angle) * r, y: oy + Math.sin(angle) * r })
    }
  }
  for (let i = 0; i < SCATTER; i++) seeds.push({ x: randomRange(random, left, right), y: randomRange(random, bottom, top) })

  const positions: number[] = []
  const edges: number[] = []
  const opens: number[] = []
  const shards: number[] = []
  const eps = 1e-5
  const onBorder = (p: Point, q: Point) =>
    (Math.abs(p.x - left) < eps && Math.abs(q.x - left) < eps) ||
    (Math.abs(p.x - right) < eps && Math.abs(q.x - right) < eps) ||
    (Math.abs(p.y - bottom) < eps && Math.abs(q.y - bottom) < eps) ||
    (Math.abs(p.y - top) < eps && Math.abs(q.y - top) < eps)

  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i]
    let cell: Point[] = [
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: right, y: top },
      { x: left, y: top },
    ]
    // Ячейка Вороного: всё, что ближе к своему зерну, чем к любому другому
    for (let j = 0; j < seeds.length && cell.length > 2; j++) {
      if (j === i) continue
      const o = seeds[j]
      const nx = o.x - s.x
      const ny = o.y - s.y
      cell = clip(cell, nx, ny, (o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y) / 2)
    }
    if (cell.length < 3) continue
    const center = centroid(cell)
    if (center.area < 1e-5) continue

    const r1 = random()
    const r2 = random()
    const cu = center.x / aspect
    const cv = center.y
    // Веер треугольников из центра куска: центр — aEdge 1, край — 0
    for (let k = 0; k < cell.length; k++) {
      const a = cell[k]
      const b = cell[(k + 1) % cell.length]
      const open = onBorder(a, b) ? 0 : 1
      for (const [p, edge] of [
        [center, 1],
        [a, 0],
        [b, 0],
      ] as const) {
        positions.push(p.x / aspect, p.y, 0)
        edges.push(edge)
        opens.push(open)
        shards.push(cu, cv, r1, r2)
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  // Нормаль у листа одна — к камере; поворот куска вершинный шейдер считает сам
  geometry.setAttribute('normal', new Float32BufferAttribute(new Float32Array(positions.length).map((_, index) => (index % 3 === 2 ? 1 : 0)), 3))
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edges, 1))
  geometry.setAttribute('aOpen', new Float32BufferAttribute(opens, 1))
  geometry.setAttribute('aShard', new Float32BufferAttribute(shards, 4))
  return geometry
}
