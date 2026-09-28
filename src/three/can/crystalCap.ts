import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three'
import { createRandom, randomRange } from '../utils/random'

// "Ледяной кристалл" на срезах банки. На продуктовом фото разрез куска
// выглядит как гранёный лёд — это и делает кадр: банка будто промёрзла
// насквозь. Здесь срез — диск из треугольных граней с чуть разной высотой:
// при плоском затенении каждая грань ловит свой блик окружения, и при
// покачивании куска поверхность искрится, как настоящий кристалл.

const TAU = Math.PI * 2

// Кольца точек от центра к краю: доля радиуса и число точек. Внешнее кольцо
// ровное и лежит точно на радиусе — к нему примыкает металлическая кромка.
const RINGS = [
  { r: 0, count: 1 },
  { r: 0.27, count: 7 },
  { r: 0.52, count: 12 },
  { r: 0.77, count: 19 },
  { r: 1, count: 64 },
]

// Максимальный подъём граней над плоскостью среза, в долях радиуса
const RELIEF = 0.05

// Палитра граней: белые, ледяные голубые и редкие стальные — как оттенки
// кристалла на фото
const FACET_COLORS = ['#ffffff', '#f1f8fc', '#e2f1fa', '#cbe6f5', '#b3d9ee', '#a4bccd'].map(
  (hex) => new Color(hex),
)
const FACET_WEIGHTS = [0.24, 0.24, 0.2, 0.16, 0.1, 0.06]

interface RingPoint {
  position: Vector3
  angle: number
}

function pickColor(random: () => number): Color {
  let roll = random()
  for (let i = 0; i < FACET_COLORS.length; i++) {
    roll -= FACET_WEIGHTS[i]
    if (roll <= 0) return FACET_COLORS[i]
  }
  return FACET_COLORS[0]
}

// Угол точки относительно стартового, в диапазоне [0, 2π)
function relativeAngle(angle: number, start: number): number {
  return (((angle - start) % TAU) + TAU) % TAU
}

// Сшивка двух соседних колец полосой треугольников ("молния"): идём по
// обоим кольцам по возрастанию угла и каждый раз шагаем по тому кольцу,
// чья следующая точка ближе. Полоса замыкается сама — последний шаг
// возвращается к стартовому ребру.
function stitchRings(inner: RingPoint[], outer: RingPoint[], triangles: Vector3[][]) {
  if (inner.length === 1) {
    for (let j = 0; j < outer.length; j++) {
      triangles.push([inner[0].position, outer[j].position, outer[(j + 1) % outer.length].position])
    }
    return
  }

  const start = inner[0].angle
  const byAngle = (a: RingPoint, b: RingPoint) => relativeAngle(a.angle, start) - relativeAngle(b.angle, start)
  const a = [...inner].sort(byAngle)
  const b = [...outer].sort(byAngle)
  const relA = (k: number) => (k === a.length ? TAU : relativeAngle(a[k].angle, start))
  const relB = (k: number) => (k === b.length ? TAU + relativeAngle(b[0].angle, start) : relativeAngle(b[k].angle, start))

  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const pa = a[i % a.length].position
    const pb = b[j % b.length].position
    if (j >= b.length || (i < a.length && relA(i + 1) < relB(j + 1))) {
      triangles.push([pa, a[(i + 1) % a.length].position, pb])
      i++
    } else {
      triangles.push([pa, b[(j + 1) % b.length].position, pb])
      j++
    }
  }
}

// facing: +1 — срез смотрит вверх (верх нижнего куска), -1 — вниз
export function createCrystalCapGeometry(radius: number, facing: 1 | -1, seed: number): BufferGeometry {
  const random = createRandom(seed)

  const rings: RingPoint[][] = RINGS.map((ring, ringIndex) => {
    const isEdge = ringIndex === RINGS.length - 1
    const isCenter = ringIndex === 0
    const offset = random() * TAU
    const points: RingPoint[] = []
    for (let i = 0; i < ring.count; i++) {
      // Внутренние кольца "дрожат" по углу и радиусу — грани выходят
      // разного размера, без видимой сетки
      const jitter = isEdge ? 0 : (random() - 0.5) * (TAU / ring.count) * 0.7
      const angle = offset + (i / ring.count) * TAU + jitter
      const r = (ring.r + (isEdge || isCenter ? 0 : randomRange(random, -0.06, 0.06))) * radius
      // Рельеф: к центру грани выше, край ровно на плоскости среза
      const height = isEdge ? 0 : randomRange(random, 0.25, 1) * RELIEF * radius * (1 - ring.r * 0.55)
      points.push({
        position: new Vector3(Math.sin(angle) * r, facing * height, Math.cos(angle) * r),
        angle,
      })
    }
    return points
  })

  const triangles: Vector3[][] = []
  for (let i = 0; i < rings.length - 1; i++) stitchRings(rings[i], rings[i + 1], triangles)

  // Несвязанная геометрия: у каждой грани свои три вершины, своя нормаль и
  // свой цвет — отсюда "гранёность"
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const edge1 = new Vector3()
  const edge2 = new Vector3()
  const normal = new Vector3()

  for (const triangle of triangles) {
    let [p0, p1, p2] = triangle
    edge1.subVectors(p1, p0)
    edge2.subVectors(p2, p0)
    normal.crossVectors(edge1, edge2)
    // Порядок обхода — лицом к нужной стороне среза
    if (normal.y * facing < 0) {
      ;[p1, p2] = [p2, p1]
      normal.negate()
    }
    if (normal.lengthSq() < 1e-12) continue
    normal.normalize()

    const color = pickColor(random)
    for (const p of [p0, p1, p2]) {
      positions.push(p.x, p.y, p.z)
      normals.push(normal.x, normal.y, normal.z)
      colors.push(color.r, color.g, color.b)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}
