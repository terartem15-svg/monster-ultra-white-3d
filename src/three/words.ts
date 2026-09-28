import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RedFormat, UnsignedByteType } from 'three'
import { FLAVORS } from '@/content/flavors'
import { OUTRO_WORD } from '@/content/site'

// Огромные слова за банкой, нарисованные в текстуры: ULTRA из финала
// первого экрана и по слову на каждый вкус коллекции (порядок — как в
// lineup/lineupLook.ts: 0 — ULTRA, k + 1 — вкус k). Шрифт — Archivo в
// широком начертании (expanded), как надпись ULTRA WHITE на самой банке.
//
// Текстура — маска: буквы белые, фон чёрный; цвет и прозрачность задаёт
// фоновый шейдер (Backdrop.tsx). Маске нужен один канал, поэтому текстура
// одноканальная (R8): восемь слов по ~2000 px занимают в видеопамяти
// вчетверо меньше, чем обычные RGBA-холсты.

export interface WordTexture {
  texture: DataTexture
  // Отношение ширины к высоте — чтобы шейдер не растянул буквы
  aspect: number
}

export const WORDS = [OUTRO_WORD, ...FLAVORS.map((flavor) => flavor.word)]

const FONT_SIZE = 480
const PADDING = 24

function applyFont(ctx: CanvasRenderingContext2D) {
  ctx.font = `820 ${FONT_SIZE}px "Archivo Variable", Archivo, sans-serif`
  ctx.fontStretch = 'expanded'
  ctx.letterSpacing = `${-0.01 * FONT_SIZE}px`
}

function drawWord(word: string): WordTexture {
  const measureCanvas = document.createElement('canvas')
  const measure = measureCanvas.getContext('2d')
  if (!measure) throw new Error('Canvas 2D is not available')
  applyFont(measure)
  const metrics = measure.measureText(word)
  const width = Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + PADDING * 2
  const height = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + PADDING * 2

  // Холст ровно по габариту букв: прямоугольник в шейдере = прямоугольник слова
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  applyFont(ctx)
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(word, PADDING + metrics.actualBoundingBoxLeft, PADDING + metrics.actualBoundingBoxAscent)

  // Красный канал → байт на пиксель. Строки переворачиваются: у DataTexture
  // нет flipY, а шейдер ждёт верх слова вверху (v = 1)
  const rgba = ctx.getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const source = y * width * 4
    const target = (height - 1 - y) * width
    for (let x = 0; x < width; x++) mask[target + x] = rgba[source + x * 4]
  }

  const texture = new DataTexture(mask, width, height, RedFormat, UnsignedByteType)
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = true
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return { texture, aspect: width / height }
}

let wordsPromise: Promise<WordTexture[]> | null = null

export function loadWords(): Promise<WordTexture[]> {
  wordsPromise ??= (async () => {
    if ('fonts' in document) await document.fonts.load(`820 expanded ${FONT_SIZE}px "Archivo Variable"`, WORDS.join(' '))
    return WORDS.map(drawWord)
  })()
  return wordsPromise
}
