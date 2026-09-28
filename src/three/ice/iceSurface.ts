import { CanvasTexture, NoColorSpace, RepeatWrapping } from 'three'
import { createRandom, randomRange } from '../utils/random'

// Микрорельеф поверхности льда, нарисованный в canvas при загрузке: без
// него кубик читается как гладкий голубой акрил. Две текстуры из одной
// карты высот:
//  - normal — мелкая рябь и тонкие трещинки: преломление "дробится",
//    как у настоящего подтаявшего льда;
//  - roughness (канал G) — пятна инея: часть поверхности матовая, часть
//    прозрачная, как у кубика, только что вынутого из морозилки.
// Текстуры бесшовные (тайлятся) и натягиваются на кубик по UV из
// проекции на грани (см. iceGeometry.ts).

const SIZE = 512

// Бесшовный value-noise: решётка замыкается по модулю периода
function createTileableNoise(period: number, seed: number) {
  const random = createRandom(seed)
  const grid = Float32Array.from({ length: period * period }, () => random())
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)]
  return (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return top + (bottom - top) * sy
  }
}

// Карта высот: несколько октав шума (рябь) + прорезанные трещинки
function createHeightField(): Float32Array {
  const height = new Float32Array(SIZE * SIZE)
  const octaves = [
    { noise: createTileableNoise(4, 1), scale: 4, weight: 0.5 },
    { noise: createTileableNoise(9, 2), scale: 9, weight: 0.3 },
    { noise: createTileableNoise(23, 3), scale: 23, weight: 0.2 },
  ]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let value = 0
      for (const { noise, scale, weight } of octaves) value += noise((x / SIZE) * scale, (y / SIZE) * scale) * weight
      height[y * SIZE + x] = value
    }
  }

  // Трещинки: ломаные линии-"порезы" в карте высот, по кругу развёртки
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx) {
    const random = createRandom(77)
    ctx.strokeStyle = '#ffffff'
    ctx.lineCap = 'round'
    for (let i = 0; i < 9; i++) {
      let x = randomRange(random, 0, SIZE)
      let y = randomRange(random, 0, SIZE)
      let angle = randomRange(random, 0, Math.PI * 2)
      ctx.lineWidth = randomRange(random, 1, 2.2)
      ctx.beginPath()
      ctx.moveTo(x, y)
      const steps = Math.floor(randomRange(random, 4, 9))
      for (let s = 0; s < steps; s++) {
        angle += randomRange(random, -0.7, 0.7)
        x += Math.cos(angle) * randomRange(random, 18, 46)
        y += Math.sin(angle) * randomRange(random, 18, 46)
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    const cracks = ctx.getImageData(0, 0, SIZE, SIZE).data
    for (let i = 0; i < SIZE * SIZE; i++) height[i] -= (cracks[i * 4] / 255) * 0.35
  }
  return height
}

export interface IceSurface {
  normal: CanvasTexture
  roughness: CanvasTexture
}

function toTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

export function createIceSurface(): IceSurface {
  const height = createHeightField()
  const sample = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]

  const normalCanvas = document.createElement('canvas')
  const roughCanvas = document.createElement('canvas')
  for (const canvas of [normalCanvas, roughCanvas]) {
    canvas.width = SIZE
    canvas.height = SIZE
  }
  const normalCtx = normalCanvas.getContext('2d')
  const roughCtx = roughCanvas.getContext('2d')
  if (!normalCtx || !roughCtx) throw new Error('Canvas 2D is not available')
  const normal = normalCtx.createImageData(SIZE, SIZE)
  const rough = roughCtx.createImageData(SIZE, SIZE)

  // Нормали из карты высот (разности соседей, как фильтр Собеля)
  const strength = 5
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength
      const length = Math.hypot(dx, dy, 1)
      const i = (y * SIZE + x) * 4
      normal.data[i] = ((-dx / length) * 0.5 + 0.5) * 255
      normal.data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255
      normal.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255
      normal.data[i + 3] = 255

      // Иней: низкие "впадины" шума матовые, высокие — прозрачный лёд
      const h = sample(x, y)
      // Матовые пятна редкие и неглубокие: сильнее — и преломление в
      // кубике "замыливается", лёд превращается в матовый пластик
      const frost = Math.min(1, Math.max(0, (0.42 - h) * 3.2))
      const roughness = 0.02 + frost * 0.12
      rough.data[i] = 255
      rough.data[i + 1] = roughness * 255
      rough.data[i + 2] = 0
      rough.data[i + 3] = 255
    }
  }
  normalCtx.putImageData(normal, 0, 0)
  roughCtx.putImageData(rough, 0, 0)
  return { normal: toTexture(normalCanvas), roughness: toTexture(roughCanvas) }
}
