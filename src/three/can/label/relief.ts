import { TEXTURE_HEIGHT, TEXTURE_WIDTH, type Layers } from './canvas'

// Рельеф этикетки → карта нормалей. Слой height содержит высоты (тиснение
// когтя и надписей, купола капель, кристаллики инея); здесь из них
// считаются нормали разностями соседних пикселей (как фильтр Собеля).
// Заодно добавляется "зерно" краски: мельчайший шум в нормалях и в
// шероховатости — поверхность перестаёт быть идеальным пластиком.

// Сила рельефа: во сколько раз усиливаются перепады высот
const STRENGTH = 5.5
// Амплитуда зерна краски в высотах и в шероховатости
const GRAIN_HEIGHT = 0.018
const GRAIN_ROUGHNESS = 10

// Быстрый детерминированный хеш пикселя → 0..1
function hash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Размытие рельефа скользящим окном: по горизонтали через шов развёртки
// (текстура замкнута), по вертикали — с прижатием к краю. Два прохода
// окна 3×3 дают почти гауссово размытие за линейное время: края тиснения
// становятся мягкими "фасками" вместо ступенек.
function blurHeights(source: Float32Array, width: number, height: number): Float32Array {
  const temp = new Float32Array(source.length)
  const out = new Float32Array(source.length)
  for (let pass = 0; pass < 2; pass++) {
    const input = pass === 0 ? source : out
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        const left = x === 0 ? width - 1 : x - 1
        const right = x === width - 1 ? 0 : x + 1
        temp[row + x] = (input[row + left] + input[row + x] + input[row + right]) / 3
      }
    }
    for (let y = 0; y < height; y++) {
      const up = Math.max(0, y - 1) * width
      const down = Math.min(height - 1, y + 1) * width
      const row = y * width
      for (let x = 0; x < width; x++) {
        out[row + x] = (temp[up + x] + temp[row + x] + temp[down + x]) / 3
      }
    }
  }
  return out
}

export function createNormalCanvas(layers: Layers): HTMLCanvasElement {
  const width = TEXTURE_WIDTH
  const height = TEXTURE_HEIGHT
  const source = layers.height.getImageData(0, 0, width, height).data
  const raw = new Float32Array(width * height)
  for (let i = 0, p = 0; i < raw.length; i++, p += 4) raw[i] = source[p] / 255
  const heights = blurHeights(raw, width, height)
  // Зерно краски добавляется после размытия — ему нужна резкость
  for (let i = 0; i < heights.length; i++) {
    heights[i] += (hash(i % width, (i / width) | 0) - 0.5) * GRAIN_HEIGHT
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  const output = ctx.createImageData(width, height)
  const data = output.data

  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1) * width
    const down = Math.min(height - 1, y + 1) * width
    const row = y * width
    for (let x = 0; x < width; x++) {
      // По горизонтали развёртка замкнута — соседи через шов
      const left = x === 0 ? width - 1 : x - 1
      const right = x === width - 1 ? 0 : x + 1
      const dx = (heights[row + right] - heights[row + left]) * STRENGTH
      const dy = (heights[down + x] - heights[up + x]) * STRENGTH
      const inverse = 1 / Math.sqrt(dx * dx + dy * dy + 1)
      const p = (row + x) * 4
      // Кодировка OpenGL (зелёный — вверх по текстуре): y холста растёт
      // вниз, v развёртки — вверх, поэтому знак у dy обратный
      data[p] = (-dx * inverse * 0.5 + 0.5) * 255
      data[p + 1] = (dy * inverse * 0.5 + 0.5) * 255
      data[p + 2] = (inverse * 0.5 + 0.5) * 255
      data[p + 3] = 255
    }
  }
  ctx.putImageData(output, 0, 0)
  return canvas
}

// Зерно шероховатости: краска не бывает идеально ровной — лёгкий разброс
// ломает "пластиковые" блики
export function addPaintGrain(layers: Layers) {
  const { surface } = layers
  const image = surface.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  const data = image.data
  for (let i = 0, p = 0; p < data.length; i++, p += 4) {
    const x = i % TEXTURE_WIDTH
    const y = (i / TEXTURE_WIDTH) | 0
    data[p + 1] = Math.min(255, Math.max(0, data[p + 1] + (hash(x + 17, y + 31) - 0.5) * GRAIN_ROUGHNESS))
  }
  surface.putImageData(image, 0, 0)
}
