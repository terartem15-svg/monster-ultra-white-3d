import { paintMetal, paintPrintEdges } from './base'
import { LAYOUT, PANEL_CENTER, TEXTURE_WIDTH, createContext2d, createLayers, toCanvasY, uToX, type Layers } from './canvas'
import { paintCondensation } from './condensation'
import { addPaintGrain, createNormalCanvas } from './relief'

// Этикетка вкуса из присланной развёртки (решение из PLAN.md, раздел 6.1):
// банка у всех вкусов наша, процедурная, меняется только картинка печати.
// Материал, рельеф, конденсат и иней — те же, что у Ultra White первого
// экрана, поэтому все банки коллекции одного качества.
//
// Развёртка — плоская картинка без материала, поэтому слои surface и height
// выводятся из самой картинки (это приближение, оно подбирается по вкусу):
//  - серебро: светлые нейтрально-серые элементы (коготь Rosa, лозы орнамента)
//    становятся металлом-фольгой;
//  - золото: тёплые жёлтые элементы (обводка когтя Java) — тоже металл;
//  - тёмная краска — матовые чернила;
//  - тиснение: всё, что заметно отличается по яркости от фона этикетки
//    (коготь, надписи, узор), чуть приподнято — карта нормалей даёт этим
//    краям мягкие блики, как у выпуклой печати.
//
// Модуль не знает про three.js и DOM: он работает и в Web Worker
// (lineup/labelWorker.ts), и на странице, если воркер недоступен.

export interface ImageLabelSpec {
  // Где на картинке центр лицевой панели (доля ширины) — он встанет на u = 0.5
  front: number
  // Высота тиснения 0..1 для элементов, отличных от фона
  emboss: number
  // Металличность обычной краски: 0 — эмаль, ~0.35 — "металлик"
  paintMetal: number
  // Сила распознавания серебра и золота 0..1 (0 — не искать)
  foil: number
  gold: number
}

export interface ImageLabelCanvases {
  color: HTMLCanvasElement | OffscreenCanvas
  surface: HTMLCanvasElement | OffscreenCanvas
  normal: HTMLCanvasElement | OffscreenCanvas
}

// Картинка-источник и её размер: ImageBitmap в воркере, <img> на странице
export interface LabelImage {
  source: CanvasImageSource
  width: number
  height: number
}

// --- Раскладка картинки на развёртке ----------------------------------------------

// Ширина "зеркальных" полос у краёв картинки в пикселях холста: они
// продолжают узор за край, прежде чем он растворится в заливке шва
const MIRROR_WIDTH = 80
// Сколько столбцов у края усредняется в цвет заливки шва
const EDGE_SAMPLE = 28

interface Placement {
  x: number
  top: number
  width: number
  height: number
  // Пикселей холста на пиксель картинки
  scale: number
}

// Высота картинки = высота печати, пропорции сохраняются. Лицевая панель
// встаёт на u = 0.5; картинка обычно уже окружности банки — оставшийся
// промежуток уходит на заднюю сторону (заливается в fillSeam).
function placeImage(image: LabelImage, front: number): Placement {
  const top = toCanvasY(LAYOUT.printTop)
  const height = toCanvasY(LAYOUT.printBottom) - top
  const scale = height / image.height
  // Слишком широкую картинку поджимаем по окружности, а не обрезаем
  const width = Math.min(TEXTURE_WIDTH, image.width * scale)
  const x = uToX(PANEL_CENTER.front) - front * width
  return { x: ((x % TEXTURE_WIDTH) + TEXTURE_WIDTH) % TEXTURE_WIDTH, top, width, height, scale: width / image.width }
}

// Рисунок, заходящий за шов развёртки, рисуется ещё раз со сдвигом на ширину
function drawWrapped(x: number, draw: (x: number) => void) {
  draw(x)
  if (x > 0) draw(x - TEXTURE_WIDTH)
}

// Край картинки, сжатый в один столбец из нескольких точек: заливка шва
// повторяет, где на краю этикетки светлее, а где темнее. Точек мало
// намеренно — при растяжении получается мягкий вертикальный градиент, а не
// горизонтальные полосы от строк текста у края
const EDGE_ROWS = 10

function edgeColumn(image: LabelImage, side: 'left' | 'right'): CanvasRenderingContext2D {
  const column = createContext2d(1, EDGE_ROWS)
  column.imageSmoothingEnabled = true
  column.imageSmoothingQuality = 'high'
  const sampleWidth = Math.min(image.width, Math.max(2, Math.round(EDGE_SAMPLE * (image.width / TEXTURE_WIDTH))))
  const sx = side === 'left' ? 0 : image.width - sampleWidth
  column.drawImage(image.source, sx, 0, sampleWidth, image.height, 0, 0, 1, EDGE_ROWS)
  return column
}

// Маска-градиент по горизонтали поверх уже нарисованного: 'destination-in'
// оставляет рисунок с прозрачностью от alphaFrom (слева) до alphaTo (справа)
function fadeHorizontally(ctx: CanvasRenderingContext2D, width: number, height: number, alphaFrom: number, alphaTo: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alphaFrom})`)
  gradient.addColorStop(1, `rgba(0, 0, 0, ${alphaTo})`)
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

// Заливка шва на задней стороне банки. Слои снизу вверх:
//  - мягкий вертикальный градиент по цветам правого края картинки;
//  - такой же по левому краю, проявляется к левому краю картинки;
//  - зеркальные полосы у обоих краёв, тающие к середине шва: узор не
//    обрывается на краю картинки, а плавно уходит в заливку.
// Зеркальный текст в середине шва не остаётся — там только градиент.
function fillSeam(color: CanvasRenderingContext2D, image: LabelImage, place: Placement) {
  const gap = Math.floor(TEXTURE_WIDTH - place.width)
  if (gap < 2) return
  const { height, top } = place
  const seam = createContext2d(gap, height)
  seam.imageSmoothingEnabled = true
  seam.imageSmoothingQuality = 'high'

  seam.drawImage(edgeColumn(image, 'right').canvas, 0, 0, gap, height)
  const fromLeft = createContext2d(gap, height)
  fromLeft.drawImage(edgeColumn(image, 'left').canvas, 0, 0, gap, height)
  fadeHorizontally(fromLeft, gap, height, 0, 1)
  seam.drawImage(fromLeft.canvas, 0, 0)

  const mirror = Math.min(MIRROR_WIDTH, Math.floor(gap / 2))
  const sourceWidth = mirror / place.scale
  if (mirror >= 4) {
    // У правого края картинки: столбец края — вплотную к картинке, дальше зеркально
    const right = createContext2d(mirror, height)
    right.translate(mirror, 0)
    right.scale(-1, 1)
    right.drawImage(image.source, image.width - sourceWidth, 0, sourceWidth, image.height, 0, 0, mirror, height)
    fadeHorizontally(right, mirror, height, 1, 0)
    seam.drawImage(right.canvas, 0, 0)

    // У левого края картинки — то же самое, зеркально с другой стороны шва
    const left = createContext2d(mirror, height)
    left.translate(mirror, 0)
    left.scale(-1, 1)
    left.drawImage(image.source, 0, 0, sourceWidth, image.height, 0, 0, mirror, height)
    fadeHorizontally(left, mirror, height, 0, 1)
    seam.drawImage(left.canvas, gap - mirror, 0)
  }

  const seamStart = (place.x + place.width) % TEXTURE_WIDTH
  drawWrapped(seamStart, (x) => color.drawImage(seam.canvas, x, top))
}

// --- Материал и тиснение из картинки ------------------------------------------------

const smoothstep = (value: number, from: number, to: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

// Яркость "фона" этикетки — медиана по всей печати: у одних банок фон
// светлый, у Noir почти чёрный, поэтому порог тиснения считается от него
function medianLuma(data: Uint8ClampedArray): number {
  const histogram = new Uint32Array(256)
  let count = 0
  for (let p = 0; p < data.length; p += 16) {
    histogram[Math.round(0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2])] += 1
    count += 1
  }
  let seen = 0
  for (let level = 0; level < 256; level++) {
    seen += histogram[level]
    if (seen >= count / 2) return level / 255
  }
  return 0.5
}

// Проход по пикселям печати: из цвета — шероховатость/металличность
// (слой surface: G и B, как читают roughnessMap и metalnessMap) и высота
// тиснения (слой height)
function deriveSurface(layers: Layers, spec: ImageLabelSpec, place: Placement) {
  const { top, height } = place
  const colorData = layers.color.getImageData(0, top, TEXTURE_WIDTH, height).data
  const surface = layers.surface.createImageData(TEXTURE_WIDTH, height)
  const relief = layers.height.createImageData(TEXTURE_WIDTH, height)
  const surfaceData = surface.data
  const reliefData = relief.data
  const background = medianLuma(colorData)

  for (let p = 0; p < colorData.length; p += 4) {
    const r = colorData[p]
    const g = colorData[p + 1]
    const b = colorData[p + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    const chroma = (max - min) / 255

    // Серебро: почти без цвета, светлое, но не белая краска
    const silver = spec.foil * (1 - smoothstep(chroma, 0.05, 0.15)) * smoothstep(luma, 0.45, 0.66) * (1 - smoothstep(luma, 0.88, 0.97))
    // Золото: насыщенный тёплый жёлтый — красный ≥ зелёный ≥ синий, оттенок
    // ближе к жёлтому, чем к оранжевому. Бежевый фон (дерево у Java) —
    // слишком блёклый и остаётся краской
    let gold = 0
    if (spec.gold > 0 && r >= g && g >= b && max > min) {
      const hue = (g - b) / (r - b)
      gold = spec.gold * smoothstep(chroma, 0.42, 0.58) * smoothstep(luma, 0.42, 0.58) * smoothstep(hue, 0.6, 0.72) * (1 - smoothstep(hue, 0.95, 1))
    }
    const metal = Math.max(silver, gold)
    const ink = (1 - smoothstep(luma, 0.08, 0.22)) * (1 - metal)

    let roughness = 0.36 + (0.2 - 0.36) * metal
    roughness += (0.34 - roughness) * ink
    let metalness = spec.paintMetal + (0.9 - spec.paintMetal) * metal
    metalness += (0.06 - metalness) * ink
    surfaceData[p] = 255
    surfaceData[p + 1] = Math.round(roughness * 255)
    surfaceData[p + 2] = Math.round(metalness * 255)
    surfaceData[p + 3] = 255

    const raised = spec.emboss * smoothstep(Math.abs(luma - background), 0.08, 0.4) + 0.1 * metal
    const level = Math.round(Math.min(1, raised) * 255)
    reliefData[p] = level
    reliefData[p + 1] = level
    reliefData[p + 2] = level
    reliefData[p + 3] = 255
  }

  layers.surface.putImageData(surface, 0, top)
  layers.height.putImageData(relief, 0, top)
}

// --- Сборка -------------------------------------------------------------------------

export function buildImageLabel(image: LabelImage, spec: ImageLabelSpec): ImageLabelCanvases {
  const layers = createLayers()
  paintMetal(layers)

  const place = placeImage(image, spec.front)
  const { color } = layers
  color.imageSmoothingEnabled = true
  color.imageSmoothingQuality = 'high'
  drawWrapped(place.x, (x) => color.drawImage(image.source, x, place.top, place.width, place.height))
  fillSeam(color, image, place)
  deriveSurface(layers, spec, place)
  paintPrintEdges(layers)

  // Дальше — как у Ultra White: конденсат и иней, зерно краски, нормали
  paintCondensation(layers)
  addPaintGrain(layers)
  const normal = createNormalCanvas(layers)
  return { color: layers.color.canvas, surface: layers.surface.canvas, normal }
}
