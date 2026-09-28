import {
  CanvasTexture,
  CatmullRomCurve3,
  ExtrudeGeometry,
  NoColorSpace,
  Path,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { createRandom, randomRange } from '../utils/random'

// Мелкие металлические детали: язычок, заклёпка, контур клапана и
// "токарная" фактура крышки и дна. На экране крышка небольшая, но верхний
// кусок в разобранном состоянии наклонён к камере, а в сцене деталей камера
// подлетает к банке вплотную — без этих мелочей банка выглядит игрушечной.

// Язычок в плоскости XY (Y — от заклёпки к кольцу), выдавлен по +Z.
// В сцене кладётся на крышку поворотом -90° вокруг X: кольцо уходит к задней
// стороне банки, как у настоящей банки, где клапан смотрит на лицевую сторону.
// Конец с кольцом чуть приподнят — штампованный язычок никогда не лежит
// идеально плоско, и на изгибе появляется живой блик.
export function createPullTabGeometry(): ExtrudeGeometry {
  const rivetHalf = 0.1
  const ringHalf = 0.118
  const length = 0.36

  const shape = new Shape()
  shape.moveTo(-rivetHalf, -0.02)
  shape.quadraticCurveTo(-rivetHalf, -0.1, 0, -0.1)
  shape.quadraticCurveTo(rivetHalf, -0.1, rivetHalf, -0.02)
  shape.lineTo(ringHalf, length - 0.13)
  shape.quadraticCurveTo(ringHalf, length, 0, length)
  shape.quadraticCurveTo(-ringHalf, length, -ringHalf, length - 0.13)
  shape.closePath()

  // Отверстие под палец и маленький вырез у заклёпки
  const fingerHole = new Path()
  fingerHole.absellipse(0, length - 0.12, 0.074, 0.066, 0, Math.PI * 2, true)
  const rivetSlot = new Path()
  rivetSlot.absellipse(0, 0.07, 0.036, 0.02, 0, Math.PI * 2, true)
  shape.holes.push(fingerHole, rivetSlot)

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.005,
    bevelSegments: 3,
    curveSegments: 28,
  })

  // Изгиб: чем дальше от заклёпки, тем выше
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    const lift = 0.22 * Math.max(0, y - 0.1) ** 2
    position.setZ(i, position.getZ(i) + lift)
  }
  geometry.computeVertexNormals()
  return geometry
}

// Головка заклёпки — приплюснутый купол поверх язычка
export function createRivetGeometry(): SphereGeometry {
  const geometry = new SphereGeometry(0.03, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  geometry.scale(1, 0.4, 1)
  return geometry
}

// Выпуклый контур клапана — капля перед заклёпкой, в плоскости крышки
export function createScoreLineGeometry(lidY: number): TubeGeometry {
  const points: Vector3[] = []
  const segments = 40
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    // Капля: широкая дуга к краю крышки и заострение к центру
    const radius = 0.1 + 0.035 * Math.cos(t)
    const x = Math.sin(t) * radius * 1.25
    const z = 0.24 + Math.cos(t) * radius - 0.02 * Math.cos(t) ** 3
    points.push(new Vector3(x, lidY + 0.002, z))
  }
  const curve = new CatmullRomCurve3(points, true)
  return new TubeGeometry(curve, 96, 0.0055, 6, true)
}

// "Токарная" фактура: крышку и дно штампуют из прокатанного листа, на них
// видны тончайшие концентрические бороздки. Карта нормалей из полос вдоль
// развёртки лейзы (v — вдоль профиля) — на банке это кольца вокруг центра.
export function createSpunMetalNormalTexture(): CanvasTexture {
  const width = 8
  const height = 1024
  const random = createRandom(55)
  // Высоты бороздок: случайная глубина, плавно сглаженная
  const heights = new Float32Array(height)
  let value = 0
  for (let y = 0; y < height; y++) {
    value = value * 0.55 + randomRange(random, -1, 1) * 0.45
    heights[y] = value
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    const dy = (heights[Math.min(height - 1, y + 1)] - heights[Math.max(0, y - 1)]) * 1.6
    const inverse = 1 / Math.sqrt(dy * dy + 1)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      image.data[p] = 128
      image.data[p + 1] = (dy * inverse * 0.5 + 0.5) * 255
      image.data[p + 2] = (inverse * 0.5 + 0.5) * 255
      image.data[p + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}
