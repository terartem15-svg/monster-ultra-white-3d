import { BufferGeometry, Float32BufferAttribute, SphereGeometry, Vector3 } from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRandom, randomRange } from '../utils/random'

// Форма льда. Кубик — скруглённый куб, чуть неровный (подтаявший), с
// волнистыми гранями и парой сколотых углов: идеальный RoundedBox читается
// как стекло или пластик, а неровности ломают преломление — глаз видит лёд.
// Крошка — маленькие гранёные осколки неправильной формы.
//
// Кроме формы здесь строится то, что делает лёд "живым" внутри и снаружи:
//  - атрибут color (RGBA) — маска инея: белёсая плёнка гуще на рёбрах и
//    углах, с россыпью кристалликов (её рисует отдельный полупрозрачный слой);
//  - пузырьки воздуха и трещины внутри — их видно только сквозь лёд.

const noise = new ImprovedNoise()

// Смещение по направлению от центра, а не по нормали: у куба на рёбрах
// вершины продублированы с разными нормалями, и смещение по нормали
// разорвало бы поверхность. По позиции — дубликаты двигаются одинаково.
function displace(geometry: BufferGeometry, amount: (point: Vector3) => number) {
  const position = geometry.getAttribute('position')
  const point = new Vector3()
  const direction = new Vector3()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)
    direction.copy(point).normalize()
    point.addScaledVector(direction, amount(point))
    position.setXYZ(i, point.x, point.y, point.z)
  }
}

// Скол угла: всё, что за плоскостью у выбранного угла, проецируется на эту
// плоскость — получается плоская грань скола
function chipCorner(geometry: BufferGeometry, normal: Vector3, distance: number) {
  const position = geometry.getAttribute('position')
  const point = new Vector3()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)
    const beyond = point.dot(normal) - distance
    if (beyond > 0) {
      point.addScaledVector(normal, -beyond)
      position.setXYZ(i, point.x, point.y, point.z)
    }
  }
}

// После смещения "сшиваем" дубликаты вершин и пересчитываем нормали —
// поверхность становится гладкой, без видимых швов на рёбрах
function weld(geometry: BufferGeometry): BufferGeometry {
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  const welded = mergeVertices(geometry, 1e-4)
  welded.computeVertexNormals()
  geometry.dispose()
  return welded
}

// Маска инея в атрибуте color (RGBA, белый с альфой): рёбра и углы куба —
// там, где нормаль "не смотрит" ни по одной оси, — плюс пятна-кристаллики
// от шума. На плоских гранях иней едва заметен, лёд там прозрачный.
function paintFrostMask(geometry: BufferGeometry, size: number, seed: number, flat = false) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const colors = new Float32Array(position.count * 4)
  const point = new Vector3()
  const f = 9 / size
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)
    const edge = flat
      ? 0.35
      : 1 - Math.max(Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i)))
    // Иней — только на настоящих рёбрах и углах; на гранях — редкие
    // кристаллики, чтобы лёд оставался прозрачным
    const rim = Math.min(1, Math.max(0, (edge - 0.12) / 0.26))
    const crystals = Math.max(0, noise.noise(point.x * f + seed, point.y * f, point.z * f - seed) * 1.8 - 0.35)
    const alpha = Math.min(0.42, rim ** 1.6 * 0.4 + crystals * 0.05)
    colors.set([1, 1, 1, alpha], i * 4)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 4))
}

// UV для карты инея (iceSurface.ts): проекция на ту грань куба, куда
// смотрит нормаль. Стыки проекций приходятся на скруглённые рёбра, где
// шов на шумовой текстуре незаметен.
function projectBoxUv(geometry: BufferGeometry, size: number) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv: number[] = []
  const repeat = 0.9 / size
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = Math.abs(normal.getZ(i))
    const x = position.getX(i) * repeat
    const y = position.getY(i) * repeat
    const z = position.getZ(i) * repeat
    if (nx >= ny && nx >= nz) uv.push(z, y)
    else if (ny >= nz) uv.push(x, z)
    else uv.push(x, y)
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
}

// --- Кубик -----------------------------------------------------------------------------

export function createIceCubeGeometry(size: number, seed: number): BufferGeometry {
  const random = createRandom(seed)
  // Кубики не идеально кубические — каждая ось чуть своя
  const sx = size * randomRange(random, 0.93, 1.06)
  const sy = size * randomRange(random, 0.93, 1.06)
  const sz = size * randomRange(random, 0.93, 1.06)
  const geometry = new RoundedBoxGeometry(sx, sy, sz, 12, size * 0.12)

  const offset = randomRange(random, 0, 100)
  displace(geometry, (p) => {
    const f = 2.2 / size
    // Крупная неровность формы + мелкая рябь + "подтаявшая" рябь потоньше
    const large = noise.noise(p.x * f + offset, p.y * f, p.z * f) * size * 0.05
    const ripple = noise.noise(p.x * f * 4.5, p.y * f * 4.5 + offset, p.z * f * 4.5) * size * 0.014
    const melt = noise.noise(p.x * f * 11, p.y * f * 11, p.z * f * 11 + offset) * size * 0.004
    return large + ripple + melt
  })

  // Два сколотых угла — у каждого кубика свои
  const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x, y, z))))
  for (let i = 0; i < 2; i++) {
    const corner = corners.splice(Math.floor(random() * corners.length), 1)[0]
    const normal = corner
      .clone()
      .add(new Vector3(randomRange(random, -0.35, 0.35), randomRange(random, -0.35, 0.35), randomRange(random, -0.35, 0.35)))
      .normalize()
    chipCorner(geometry, normal, size * randomRange(random, 0.68, 0.76))
  }

  const welded = weld(geometry)
  projectBoxUv(welded, size)
  paintFrostMask(welded, size, seed)
  return welded
}

// --- Крошка ------------------------------------------------------------------------------

// Осколок льда: выпуклая оболочка случайных точек на сплюснутой сфере —
// неправильный многогранник с плоскими гранями
export function createIceChipGeometry(size: number, seed: number): BufferGeometry {
  const random = createRandom(seed)
  const points: Vector3[] = []
  for (let i = 0; i < 16; i++) {
    const theta = random() * Math.PI * 2
    const phi = Math.acos(randomRange(random, -1, 1))
    const r = (size / 2) * randomRange(random, 0.72, 1.05)
    points.push(
      new Vector3(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r * 0.8, Math.sin(phi) * Math.sin(theta) * r * 1.1),
    )
  }
  const geometry: BufferGeometry = new ConvexGeometry(points)
  geometry.computeVertexNormals()
  projectBoxUv(geometry, size * 2)
  paintFrostMask(geometry, size, seed, true)
  return geometry
}

// --- Пузырьки -------------------------------------------------------------------------------

// Пузырьки воздуха, вмёрзшие в лёд: россыпь крошечных непрозрачных сфер у
// центра и цепочка пузырьков по диагонали — след, как в настоящем льду.
// Непрозрачные — значит попадают в буфер преломления, и сквозь лёд видны
// искажёнными.
export function createBubblesGeometry(size: number, seed: number): BufferGeometry {
  const random = createRandom(seed + 211)
  const bubbles: BufferGeometry[] = []
  const addBubble = (x: number, y: number, z: number, radius: number) => {
    const bubble = new SphereGeometry(radius, 10, 8)
    bubble.scale(1, randomRange(random, 0.8, 1.3), 1)
    bubble.translate(x, y, z)
    bubbles.push(bubble)
  }

  const scattered = 9 + Math.floor(random() * 6)
  for (let i = 0; i < scattered; i++) {
    addBubble(
      size * randomRange(random, -0.25, 0.25),
      size * randomRange(random, -0.25, 0.25),
      size * randomRange(random, -0.25, 0.25),
      size * randomRange(random, 0.008, 0.024),
    )
  }

  // Цепочка: пузырьки уменьшаются вдоль линии
  const start = new Vector3(randomRange(random, -0.2, 0.2), -0.24, randomRange(random, -0.2, 0.2)).multiplyScalar(size)
  const direction = new Vector3(randomRange(random, -0.3, 0.3), 1, randomRange(random, -0.3, 0.3)).normalize()
  for (let i = 0; i < 7; i++) {
    const at = start.clone().addScaledVector(direction, size * 0.07 * i)
    addBubble(at.x, at.y, at.z, size * (0.016 - i * 0.0016))
  }

  const merged = mergeGeometries(bubbles)
  for (const bubble of bubbles) bubble.dispose()
  return merged
}

// --- Трещины ---------------------------------------------------------------------------------

// Внутренние трещины: одна-две неровные плоские "пластинки" в толще льда.
// Их материал отражающий — трещина вспыхивает серебром, когда лёд
// поворачивается, как настоящий скол внутри кубика.
export function createCracksGeometry(size: number, seed: number): BufferGeometry {
  const random = createRandom(seed + 509)
  const positions: number[] = []
  const count = 1 + Math.floor(random() * 2)
  for (let c = 0; c < count; c++) {
    const normal = new Vector3(randomRange(random, -1, 1), randomRange(random, -1, 1), randomRange(random, -1, 1)).normalize()
    const tangent = new Vector3(0, 1, 0).cross(normal).normalize()
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
    const bitangent = normal.clone().cross(tangent)
    const center = new Vector3(randomRange(random, -0.08, 0.08), randomRange(random, -0.08, 0.08), randomRange(random, -0.08, 0.08)).multiplyScalar(size)
    const sides = 6 + Math.floor(random() * 3)
    const radius = size * randomRange(random, 0.2, 0.3)
    const rim: Vector3[] = []
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2
      const r = radius * randomRange(random, 0.55, 1)
      rim.push(center.clone().addScaledVector(tangent, Math.cos(a) * r).addScaledVector(bitangent, Math.sin(a) * r))
    }
    for (let i = 0; i < sides; i++) {
      const a = rim[i]
      const b = rim[(i + 1) % sides]
      positions.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}
