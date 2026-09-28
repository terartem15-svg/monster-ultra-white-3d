import { CanvasTexture, NoColorSpace } from 'three'
import { OUTRO_WORD } from '@/content/site'

// Огромное слово для финала скролл-сцены, нарисованное в canvas-текстуру.
// Шрифт — Archivo в широком начертании (expanded), как надпись ULTRA WHITE
// на самой банке. Текстура — маска: буквы белые в красном канале, фон
// чёрный; цвет и прозрачность задаёт фоновый шейдер (Backdrop.tsx).

export interface OutroWordTexture {
  texture: CanvasTexture
  // Отношение ширины к высоте — чтобы шейдер не растянул буквы
  aspect: number
}

const FONT_SIZE = 480
const PADDING = 24

let wordPromise: Promise<OutroWordTexture> | null = null

export function loadOutroWord(): Promise<OutroWordTexture> {
  wordPromise ??= (async () => {
    const font = `820 expanded ${FONT_SIZE}px "Archivo Variable"`
    if ('fonts' in document) await document.fonts.load(font, OUTRO_WORD)

    const measureCanvas = document.createElement('canvas')
    const measure = measureCanvas.getContext('2d')
    if (!measure) throw new Error('Canvas 2D is not available')
    const applyFont = (ctx: CanvasRenderingContext2D) => {
      ctx.font = `820 ${FONT_SIZE}px "Archivo Variable", Archivo, sans-serif`
      ctx.fontStretch = 'expanded'
      ctx.letterSpacing = `${-0.01 * FONT_SIZE}px`
    }
    applyFont(measure)
    const metrics = measure.measureText(OUTRO_WORD)
    const width = Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + PADDING * 2
    const height = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + PADDING * 2

    // Холст ровно по габариту букв: прямоугольник в шейдере = прямоугольник слова
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is not available')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
    applyFont(ctx)
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(OUTRO_WORD, PADDING + metrics.actualBoundingBoxLeft, PADDING + metrics.actualBoundingBoxAscent)

    const texture = new CanvasTexture(canvas)
    texture.colorSpace = NoColorSpace
    return { texture, aspect: width / height }
  })()
  return wordPromise
}
