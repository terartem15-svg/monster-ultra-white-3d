import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three'
import { createRandom } from '../utils/random'

// Клуб пара — маленькая текстура: мягкое пятно, изъеденное шумом, чтобы
// края были рваными, как у настоящего морозного пара. Рисуется один раз на
// canvas; каждая частица берёт её со своим поворотом — клубы не похожи друг
// на друга. Один канал (R) — сколько пара в точке.

const SIZE = 128

function createNoise(cells: number, seed: number) {
  const random = createRandom(seed)
  const grid = Float32Array.from({ length: (cells + 1) * (cells + 1) }, () => random())
  const at = (x: number, y: number) => grid[y * (cells + 1) + x]
  return (u: number, v: number) => {
    const gx = u * cells
    const gy = v * cells
    const x0 = Math.min(cells - 1, Math.floor(gx))
    const y0 = Math.min(cells - 1, Math.floor(gy))
    const fx = gx - x0
    const fy = gy - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return top + (bottom - top) * sy
  }
}

let texture: CanvasTexture | null = null

export function vaporTexture(): CanvasTexture {
  if (texture) return texture
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  const octaves = [
    { noise: createNoise(4, 801), weight: 0.55 },
    { noise: createNoise(9, 802), weight: 0.3 },
    { noise: createNoise(19, 803), weight: 0.15 },
  ]
  const image = ctx.createImageData(SIZE, SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE
      const v = (y + 0.5) / SIZE
      const r = Math.hypot(u - 0.5, v - 0.5) * 2
      // Пятно с мягким краем; шум выедает его неравномерно — клочья
      const falloff = Math.max(0, 1 - r) ** 1.6
      let n = 0
      for (const { noise, weight } of octaves) n += noise(u, v) * weight
      const value = Math.max(0, Math.min(1, falloff * (n * 2.1 - 0.55)))
      const byte = Math.round(value * 255)
      const offset = (y * SIZE + x) * 4
      image.data[offset] = byte
      image.data[offset + 1] = byte
      image.data[offset + 2] = byte
      image.data[offset + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  texture = new CanvasTexture(canvas)
  texture.colorSpace = NoColorSpace
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  return texture
}
