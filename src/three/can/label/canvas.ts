import { CAN_HEIGHT, CAN_RADIUS } from '../canDimensions'

// Общая "бумага" этикетки: развёртка банки, раскладка по высоте, слои и
// кисти. Все модули этикетки (орнамент, панели) рисуют через эти
// помощники — так фигура всегда попадает во все нужные слои разом. Карты
// капель и инея (cold/) пользуются той же развёрткой.

// --- Развёртка ------------------------------------------------------------------

const CIRCUMFERENCE = Math.PI * 2 * CAN_RADIUS
export const TEXTURE_WIDTH = 2048
// Квадратный пиксель: ширина текстуры = длина окружности, высота = высота банки
export const PX_PER_UNIT = TEXTURE_WIDTH / CIRCUMFERENCE
export const TEXTURE_HEIGHT = Math.round(CAN_HEIGHT * PX_PER_UNIT)

// Высота на банке (ед. от дна) → y на холсте. Верх холста = верх банки.
export const toCanvasY = (y: number) => (CAN_HEIGHT - y) * PX_PER_UNIT
// Длина в единицах сцены → пиксели холста
export const px = (units: number) => units * PX_PER_UNIT
// Доля окружности → x на холсте. u = 0.5 — лицевая сторона (смотрит в камеру),
// u растёт вправо, если смотреть на банку спереди (см. canShape.ts)
export const uToX = (u: number) => u * TEXTURE_WIDTH

// --- Раскладка ------------------------------------------------------------------------

// Три панели, как на развёртке настоящей банки: лицевая с когтем, справа
// от неё — история бренда со штрихкодом, слева — пищевая ценность
export const PANEL_CENTER = {
  front: 0.5,
  story: 0.83,
  nutrition: 0.17,
}

// Высоты в единицах от дна банки
export const LAYOUT = {
  printBottom: 0.26, // ниже — голый алюминий каблука
  printTop: 2.8, // выше — горлышко
  topBandBaseline: 2.672, // ZERO SUGAR / + TAURINE + / + GINSENG +
  claw: { top: 2.6, height: 1.6 },
  wordmark: { top: 0.99, width: 1.05 },
  energyBaseline: 0.625,
  ultraWhiteBaseline: 0.455,
  finePrint: [0.365, 0.33],
}

// --- Цвета --------------------------------------------------------------------------

export const INK = {
  navy: '#102536',
  graphite: '#2c3b48',
  energyBlue: '#56b0dc',
  fine: '#56677a',
  black: '#10161c',
  // Серебро орнамента: чуть холоднее нейтрального серого
  silver: 'rgb(158, 172, 186)',
  silverSoft: 'rgba(170, 184, 198, 0.42)',
  highlight: 'rgba(255, 255, 255, 0.92)',
}

// --- Материал -----------------------------------------------------------------------

// [шероховатость, металличность] 0..1 — так их читают roughnessMap (канал G)
// и metalnessMap (канал B) в three.js
export type Surface = [number, number]

export const SURFACE = {
  paint: [0.36, 0.14] as Surface,
  aluminum: [0.24, 1] as Surface,
  // Орнамент — металлизированная краска: серебро вспыхивает при повороте
  foil: [0.2, 0.9] as Surface,
  // Зеркальная фольга маленького когтя на обороте — как на настоящей банке
  chrome: [0.08, 1] as Surface,
  ink: [0.34, 0.06] as Surface,
}

const surfaceStyle = ([roughness, metalness]: Surface) =>
  `rgb(255, ${Math.round(roughness * 255)}, ${Math.round(metalness * 255)})`

// --- Слои ----------------------------------------------------------------------------

// Три холста одной развёртки:
//  - color — цвет этикетки;
//  - surface — материал (шероховатость/металличность);
//  - height — рельеф: тиснение надписей и узора. Из него потом считается
//    карта нормалей (relief.ts). Высоты складываются (режим lighter).
export interface Layers {
  color: CanvasRenderingContext2D
  surface: CanvasRenderingContext2D
  height: CanvasRenderingContext2D
}

export type LayerKind = keyof Layers

// Холст слоя. На странице — обычный <canvas>, в Web Worker (этикетки вкусов
// коллекции рисуются там, чтобы не подвешивать скролл) — OffscreenCanvas.
// Его 2D-контекст умеет всё, чем пользуются модули этикетки (фигуры,
// градиенты, Path2D, getImageData), поэтому дальше он идёт под общим типом
// CanvasRenderingContext2D, а не расползается union-типом по всему коду.
//
// willReadFrequently: холст рисуется процессором (растр Skia), а не через
// GPU. Этикетка рисуется один раз, а слои потом читаются (getImageData) —
// на CPU это предсказуемо быстро на любой машине. С GPU-холстом на
// компьютере без нормальной видеокарты (программный рендер) те же тысячи
// фигур рисовались бы минутами.
export function createContext2d(width: number, height: number): CanvasRenderingContext2D {
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    context = canvas.getContext('2d', { willReadFrequently: true })
  } else {
    context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })
  }
  if (!context) throw new Error('Canvas 2D is not available')
  return context as CanvasRenderingContext2D
}

export function createLayers(): Layers {
  const createLayer = () => createContext2d(TEXTURE_WIDTH, TEXTURE_HEIGHT)
  const layers = { color: createLayer(), surface: createLayer(), height: createLayer() }
  // Рельеф начинается с ровного нуля
  layers.height.fillStyle = '#000000'
  layers.height.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  return layers
}

export interface PaintSpec {
  // Материал фигуры; без него слой surface не трогается
  surface?: Surface
  // Высота рельефа 0..1; без неё фигура плоская. Края рельефа смягчаются
  // одним общим размытием при расчёте нормалей (relief.ts), а не фильтром
  // на каждую фигуру — так на порядок быстрее
  height?: number
  // Режим "стирания": фигура опускает рельеф и перекрывает материал
  // (используется для чистых подложек под текстом)
  flatten?: boolean
}

// Рисует одну и ту же фигуру во всех нужных слоях. draw получает контекст и
// вид слоя: цвет задаётся только для слоя color, для остальных стили уже
// выставлены (материал или уровень высоты).
export function paint(layers: Layers, spec: PaintSpec, draw: (ctx: CanvasRenderingContext2D, kind: LayerKind) => void) {
  layers.color.save()
  draw(layers.color, 'color')
  layers.color.restore()

  if (spec.surface) {
    const ctx = layers.surface
    ctx.save()
    ctx.fillStyle = surfaceStyle(spec.surface)
    ctx.strokeStyle = surfaceStyle(spec.surface)
    draw(ctx, 'surface')
    ctx.restore()
  }

  if (spec.height !== undefined || spec.flatten) {
    const ctx = layers.height
    ctx.save()
    if (spec.flatten) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#000000'
      ctx.strokeStyle = '#000000'
    } else {
      const level = Math.round(Math.min(1, spec.height ?? 0) * 255)
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgb(${level}, ${level}, ${level})`
      ctx.strokeStyle = `rgb(${level}, ${level}, ${level})`
    }
    draw(ctx, 'height')
    ctx.restore()
  }
}

// Элементы у шва развёртки (u ≈ 0/1) рисуются трижды со сдвигом на ширину
// текстуры — иначе на банке остался бы видимый обрыв узора
export function wrapAround(ctx: CanvasRenderingContext2D, draw: () => void) {
  for (const offset of [-TEXTURE_WIDTH, 0, TEXTURE_WIDTH]) {
    ctx.save()
    ctx.translate(offset, 0)
    draw()
    ctx.restore()
  }
}

// Шрифты этикетки: Archivo (как на сайте), рукописный Mansalva для истории
// бренда и "потёртый" Rubik Dirt для слогана — стиль оборота настоящей банки
export const FONT = {
  sans: '"Archivo Variable", Archivo, sans-serif',
  hand: '"Mansalva", "Archivo Variable", cursive',
  grunge: '"Rubik Dirt", "Archivo Variable", sans-serif',
}
