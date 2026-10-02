import { CLAW_HEIGHT, CLAW_STROKES, CLAW_WIDTH, WORDMARK_PATH, WORDMARK_WIDTH } from '@/brand/logoPaths'
import { INGREDIENT_LIST } from '@/content/inside'
import { createRandom, randomRange } from '../../utils/random'
import {
  FONT,
  INK,
  LAYOUT,
  PANEL_CENTER,
  SURFACE,
  TEXTURE_WIDTH,
  paint,
  px,
  toCanvasY,
  uToX,
  type Layers,
  type Surface,
} from './canvas'
import { paintClearing } from './ornament'

// Надписи и панели этикетки. Раскладка — по развёртке оригинальной банки
// Ultra: лицевая панель с огромным когтем, панель истории бренда (маленький
// хромированный коготь, рукописный текст, слоган, штрихкод) и панель
// пищевой ценности. Лицевая панель — по продуктовому фото Ultra White:
// ледяной коготь с тёмной обводкой, MONSTER / ENERGY / ULTRA WHITE.

const CLAW_PATHS = CLAW_STROKES.map((d) => new Path2D(d))
const WORDMARK = new Path2D(WORDMARK_PATH)

// --- Текст ----------------------------------------------------------------------------

interface TextOptions {
  text: string
  x: number
  y: number
  size: number
  weight?: number
  font?: string
  stretch?: CanvasFontStretch
  tracking?: number
  align?: CanvasTextAlign
  color: string
  surface?: Surface
  height?: number
  rotate?: number
}

// Одна строка текста во всех слоях. Размер — кегль в пикселях холста,
// разрядка — в долях кегля (как em в CSS).
function drawText(layers: Layers, options: TextOptions) {
  const tracking = (options.tracking ?? 0) * options.size
  paint(layers, { surface: options.surface ?? SURFACE.ink, height: options.height }, (ctx, kind) => {
    ctx.font = `${options.weight ?? 400} ${options.size}px ${options.font ?? FONT.sans}`
    ctx.fontStretch = options.stretch ?? 'normal'
    ctx.letterSpacing = `${tracking}px`
    ctx.textAlign = options.align ?? 'center'
    ctx.textBaseline = 'alphabetic'
    if (kind === 'color') ctx.fillStyle = options.color
    ctx.translate(options.x, options.y)
    if (options.rotate) ctx.rotate(options.rotate)
    // letterSpacing добавляет разрядку и после последней буквы — при
    // выравнивании по центру сдвигаем строку на половину разрядки
    const shift = (options.align ?? 'center') === 'center' ? tracking / 2 : 0
    ctx.fillText(options.text, shift, 0)
  })
}

// Перенос текста по ширине — для истории бренда и состава
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

let measureContext: CanvasRenderingContext2D | null = null
function measurer(): CanvasRenderingContext2D {
  measureContext ??= document.createElement('canvas').getContext('2d')
  if (!measureContext) throw new Error('Canvas 2D is not available')
  return measureContext
}

// --- Коготь -----------------------------------------------------------------------------

interface ClawOptions {
  x: number
  y: number
  height: number
  // Заливка: ледяной градиент (лицевая) или зеркальная фольга (оборот)
  finish: 'ice' | 'chrome'
  outline: number
  embossed: number
}

// Коготь: тёмная обводка снаружи, заливка, светлый внутренний кант (блик
// по краю — коготь выглядит выпуклым) и тиснение в карте рельефа
function drawClaw(layers: Layers, options: ClawOptions) {
  const scale = options.height / CLAW_HEIGHT
  const place = (ctx: CanvasRenderingContext2D) => {
    ctx.translate(options.x - (CLAW_WIDTH * scale) / 2, options.y)
    ctx.scale(scale, scale)
  }

  // Под когтем рельеф орнамента не должен проступать сквозь заливку —
  // высоты по контуру когтя (вместе с обводкой) обнуляются
  const { height } = layers
  height.save()
  place(height)
  height.fillStyle = '#000000'
  height.strokeStyle = '#000000'
  height.lineJoin = 'round'
  height.lineWidth = options.outline
  for (const path of CLAW_PATHS) {
    height.fill(path)
    height.stroke(path)
  }
  height.restore()

  // Обводка — половина линии снаружи контура, её не закрывает заливка
  paint(layers, { surface: SURFACE.ink, height: options.embossed * 0.8 }, (ctx, kind) => {
    place(ctx)
    ctx.lineJoin = 'round'
    ctx.lineWidth = options.outline
    if (kind === 'color') ctx.strokeStyle = INK.navy
    for (const path of CLAW_PATHS) ctx.stroke(path)
  })

  const fillSurface: Surface = options.finish === 'chrome' ? SURFACE.chrome : [0.24, 0.32]
  paint(layers, { surface: fillSurface, height: options.embossed }, (ctx, kind) => {
    place(ctx)
    if (kind === 'color') {
      const gradient = ctx.createLinearGradient(0, 0, 0, CLAW_HEIGHT)
      if (options.finish === 'chrome') {
        // Зеркальная фольга: цвет почти белый — всё решают отражения
        gradient.addColorStop(0, '#f4f7fa')
        gradient.addColorStop(1, '#dfe6ec')
      } else {
        // Лёд: белёсые верхушки, насыщенно-голубые кончики, как на фото
        gradient.addColorStop(0, '#eef7fc')
        gradient.addColorStop(0.42, '#cde6f5')
        gradient.addColorStop(1, '#86c3e8')
      }
      ctx.fillStyle = gradient
    }
    for (const path of CLAW_PATHS) ctx.fill(path)
  })

  // Внутренний кант: белая линия по контуру, обрезанная формой когтя —
  // видна только её внутренняя половина
  paint(layers, {}, (ctx, kind) => {
    if (kind !== 'color') return
    place(ctx)
    ctx.lineJoin = 'round'
    ctx.lineWidth = options.finish === 'chrome' ? 1.6 : 2.4
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    for (const path of CLAW_PATHS) {
      ctx.save()
      ctx.clip(path)
      ctx.stroke(path)
      ctx.restore()
    }
  })
}

function drawWordmark(layers: Layers, x: number, y: number, width: number, embossed: number) {
  const scale = width / WORDMARK_WIDTH
  paint(layers, { surface: SURFACE.ink, height: embossed }, (ctx, kind) => {
    ctx.translate(x - width / 2, y)
    ctx.scale(scale, scale)
    if (kind === 'color') ctx.fillStyle = INK.navy
    ctx.fill(WORDMARK, 'evenodd')
  })
}

// --- Верхний пояс ------------------------------------------------------------------------

// Надписи под горлышком по кругу: ZERO SUGAR спереди, по бокам — ключевые
// ингредиенты, между словами — плюсы-разделители, как "+ TAURINE +" на
// обороте настоящей банки. Плюсы стоят ровно посередине между словами —
// кольцо надписей читается ровно, как ни поверни банку.
function paintTopBand(layers: Layers) {
  const y = toCanvasY(LAYOUT.topBandBaseline)
  const tracking = 0.18
  const words = [
    { u: PANEL_CENTER.nutrition, text: 'GINSENG', size: px(0.094) },
    { u: PANEL_CENTER.front, text: 'ZERO SUGAR', size: px(0.11) },
    { u: PANEL_CENTER.story, text: 'TAURINE', size: px(0.094) },
  ]
  // Ширина каждого слова — чтобы плюс встал ровно посередине промежутка
  const ctx = measurer()
  const spans = words.map(({ u, text, size }) => {
    ctx.font = `700 ${size}px ${FONT.sans}`
    ctx.fontStretch = 'expanded'
    ctx.letterSpacing = `${tracking * size}px`
    const width = ctx.measureText(text).width
    const center = uToX(u)
    return { left: center - width / 2, right: center + width / 2 }
  })
  ctx.letterSpacing = '0px'

  for (const { u, text, size } of words) {
    drawText(layers, {
      text,
      x: uToX(u),
      y,
      size,
      weight: 700,
      stretch: 'expanded',
      tracking,
      color: INK.graphite,
      height: 0.12,
    })
  }
  spans.forEach((span, index) => {
    // Промежуток до следующего слова по кругу (последний — через шов)
    const next = spans[(index + 1) % spans.length]
    const nextLeft = index === spans.length - 1 ? next.left + TEXTURE_WIDTH : next.left
    const x = ((span.right + nextLeft) / 2) % TEXTURE_WIDTH
    drawText(layers, {
      text: '+',
      x,
      y,
      size: px(0.1),
      weight: 600,
      color: INK.graphite,
      height: 0.12,
    })
  })
}

// --- Лицевая панель -------------------------------------------------------------------------

function paintFrontPanel(layers: Layers) {
  const x = uToX(PANEL_CENTER.front)

  // Светлое поле под надписями внизу — орнамент под ними гаснет
  paintClearing(layers, x - px(0.62), toCanvasY(1.0), px(1.24), px(0.68), 0.85)

  drawClaw(layers, {
    x,
    y: toCanvasY(LAYOUT.claw.top),
    height: px(LAYOUT.claw.height),
    finish: 'ice',
    outline: 6.2,
    embossed: 0.5,
  })

  drawWordmark(layers, x, toCanvasY(LAYOUT.wordmark.top), px(LAYOUT.wordmark.width), 0.3)

  drawText(layers, {
    text: 'ENERGY',
    x,
    y: toCanvasY(LAYOUT.energyBaseline),
    size: px(0.108),
    weight: 640,
    stretch: 'expanded',
    tracking: 0.42,
    color: INK.energyBlue,
    height: 0.1,
  })
  drawText(layers, {
    text: 'ULTRA WHITE',
    x,
    y: toCanvasY(LAYOUT.ultraWhiteBaseline),
    size: px(0.142),
    weight: 820,
    stretch: 'expanded',
    tracking: 0.07,
    color: INK.navy,
    height: 0.14,
  })
  const [line1, line2] = LAYOUT.finePrint
  drawText(layers, {
    text: 'Energy drink with taurine, ginseng and B-vitamins. Zero sugar, 10 calories per can.',
    x,
    y: toCanvasY(line1),
    size: px(0.036),
    weight: 500,
    color: INK.fine,
  })
  drawText(layers, {
    text: 'High caffeine content. Not recommended for children or pregnant women. 500 ml',
    x,
    y: toCanvasY(line2),
    size: px(0.036),
    weight: 500,
    color: INK.fine,
  })
}

// --- Панель истории бренда ------------------------------------------------------------------

// Свой текст в духе оборота оригинальной банки — рукописный, с характером
const STORY =
  'Cold runs in the family. We took our full Monster energy blend, pulled out every gram of sugar and chilled it until it turned white. What is left is light, crisp and ice-cold, with the kick you came for. Keep your cool, keep your edge. This is Monster Energy Ultra White.'

function paintStoryPanel(layers: Layers) {
  const center = uToX(PANEL_CENTER.story)
  const left = center - px(0.5)
  const width = px(1.0)

  paintClearing(layers, left - 24, toCanvasY(2.52), width + 48, px(1.62), 0.92)

  // Логотип-блок: маленький зеркальный коготь и MONSTER / ENERGY / ULTRA
  const clawHeight = px(0.3)
  drawClaw(layers, {
    x: left + (CLAW_WIDTH / CLAW_HEIGHT) * clawHeight * 0.5,
    y: toCanvasY(2.5),
    height: clawHeight,
    finish: 'chrome',
    outline: 4.2,
    embossed: 0.45,
  })
  const markLeft = left + (CLAW_WIDTH / CLAW_HEIGHT) * clawHeight + px(0.04)
  const markWidth = left + width - markLeft
  drawWordmark(layers, markLeft + markWidth / 2, toCanvasY(2.49), markWidth, 0.25)
  drawText(layers, {
    text: 'ENERGY',
    x: markLeft + markWidth / 2,
    y: toCanvasY(2.29),
    size: px(0.052),
    weight: 640,
    stretch: 'expanded',
    tracking: 0.5,
    color: INK.energyBlue,
  })
  drawText(layers, {
    text: 'ULTRA',
    x: markLeft + markWidth / 2,
    y: toCanvasY(2.215),
    size: px(0.042),
    weight: 800,
    stretch: 'expanded',
    tracking: 0.12,
    color: INK.black,
  })

  // История — рукописным шрифтом, строки чуть "гуляют", как от руки
  const size = px(0.058)
  const ctx = measurer()
  ctx.font = `400 ${size}px ${FONT.hand}`
  const lines = wrapLines(ctx, STORY, width)
  const random = createRandom(404)
  lines.forEach((line, index) => {
    drawText(layers, {
      text: line,
      x: left,
      y: toCanvasY(2.12) + index * size * 1.22,
      size,
      font: FONT.hand,
      align: 'left',
      color: INK.black,
      rotate: randomRange(random, -0.012, 0.012),
    })
  })

  // Слоган: голубые "потёртые" буквы с тёмной обводкой, на наклоне
  const tagline = ['Unleash the', 'Ultra Beast!']
  const taglineSize = px(0.1)
  tagline.forEach((line, index) => {
    const y = toCanvasY(2.12) + lines.length * size * 1.22 + taglineSize * (0.9 + index * 0.95)
    paint(layers, { surface: SURFACE.ink, height: 0.18 }, (paintCtx, kind) => {
      paintCtx.font = `400 ${taglineSize}px ${FONT.grunge}`
      paintCtx.textAlign = 'left'
      paintCtx.translate(left + index * px(0.1), y)
      paintCtx.rotate(-0.07)
      paintCtx.lineJoin = 'round'
      paintCtx.lineWidth = 7
      if (kind === 'color') paintCtx.strokeStyle = INK.navy
      paintCtx.strokeText(line, 0, 0)
      if (kind === 'color') paintCtx.fillStyle = '#62bbe4'
      paintCtx.fillText(line, 0, 0)
    })
  })

  drawText(layers, {
    text: 'monsterenergy.com',
    x: left,
    y: toCanvasY(0.98),
    size: px(0.05),
    weight: 700,
    stretch: 'condensed',
    align: 'left',
    color: INK.navy,
  })

  // Штрихкод — вертикальный, как на обороте настоящей банки. Стоит у
  // дальнего края панели: ближе к лицевой стороне он мелькал бы полоской
  // на силуэте банки
  const barcodeRandom = createRandom(31)
  const barWidth = px(0.2)
  const barLength = px(0.5)
  const barLeft = left + width - barWidth - 44
  const barTop = toCanvasY(0.9)
  paint(layers, { surface: SURFACE.ink }, (paintCtx, kind) => {
    if (kind === 'color') paintCtx.fillStyle = '#ffffff'
    paintCtx.fillRect(barLeft - 8, barTop - 8, barWidth + 44, barLength + 16)
    if (kind === 'color') paintCtx.fillStyle = INK.black
    let y = barTop
    while (y < barTop + barLength) {
      const h = Math.floor(randomRange(barcodeRandom, 1, 4)) * 2
      if (barcodeRandom() > 0.42) paintCtx.fillRect(barLeft, y, barWidth, h)
      y += h + 2
    }
    paintCtx.font = `500 ${px(0.034)}px ${FONT.sans}`
    paintCtx.letterSpacing = '5px'
    paintCtx.translate(barLeft + barWidth + 30, barTop + barLength)
    paintCtx.rotate(-Math.PI / 2)
    paintCtx.fillText('0 70847 03321 8', 0, 0)
  })

  // Плашка ZERO SUGAR — у ближнего края панели, под адресом сайта
  const badgeX = left
  const badgeY = toCanvasY(0.82)
  paint(layers, { surface: SURFACE.ink, height: 0.1 }, (paintCtx, kind) => {
    paintCtx.lineWidth = 3
    if (kind === 'color') paintCtx.strokeStyle = INK.graphite
    paintCtx.beginPath()
    paintCtx.roundRect(badgeX, badgeY, px(0.3), px(0.2), 12)
    paintCtx.stroke()
  })
  for (const [index, word] of ['ZERO', 'SUGAR'].entries()) {
    drawText(layers, {
      text: word,
      x: badgeX + px(0.15),
      y: badgeY + px(0.085) + index * px(0.072),
      size: px(0.058),
      weight: 800,
      stretch: 'condensed',
      tracking: 0.06,
      color: INK.graphite,
    })
  }
}

// --- Панель пищевой ценности -----------------------------------------------------------------

// Таблица в формате американской этикетки — цифры с развёртки банки Ultra
const NUTRITION_ROWS: { label: string; value?: string; percent?: string; indent?: number; bold?: boolean }[] = [
  { label: 'Total Fat', value: '0g', percent: '0%', bold: true },
  { label: 'Sodium', value: '370mg', percent: '16%', bold: true },
  { label: 'Total Carbohydrate', value: '6g', percent: '2%', bold: true },
  { label: 'Total Sugars', value: '0g', indent: 1 },
  { label: 'Includes 0g Added Sugars', percent: '0%', indent: 2 },
  { label: 'Erythritol', value: '2g', indent: 1 },
  { label: 'Protein', value: '0g', bold: true },
]

const VITAMIN_ROWS = [
  ['Niacin (Vit. B3)', '250%'],
  ['Vitamin B6', '240%'],
  ['Vitamin B12', '490%'],
  ['Pantothenic Acid (Vit. B5)', '400%'],
]

// Состав — тот же список, что в главе «Состав» (content/inside.ts): дословно
// с развёртки, прописными, как на банке
const INGREDIENTS = `INGREDIENTS: ${INGREDIENT_LIST.join(', ').toUpperCase()}.`

const BLEND =
  'MONSTER ENERGY BLEND: TAURINE, L-CARNITINE, CAFFEINE, INOSITOL. CAFFEINE FROM ALL SOURCES: 140 MG PER CAN. CONSUME RESPONSIBLY: NOT RECOMMENDED FOR CHILDREN, PEOPLE SENSITIVE TO CAFFEINE, PREGNANT WOMEN OR WOMEN WHO ARE NURSING.'

function paintNutritionPanel(layers: Layers) {
  const center = uToX(PANEL_CENTER.nutrition)
  const width = px(0.96)
  const left = center - width / 2
  const right = left + width
  const top = toCanvasY(2.5)
  const pad = 14

  paintClearing(layers, left - 30, top - 30, width + 60, px(2.1), 0.9)

  const rule = (y: number, thickness: number) =>
    paint(layers, { surface: SURFACE.ink }, (ctx, kind) => {
      if (kind === 'color') ctx.fillStyle = INK.black
      ctx.fillRect(left + pad, y, width - pad * 2, thickness)
    })
  const row = (y: number, label: string, value: string, size: number, weight: number, indent = 0) => {
    drawText(layers, {
      text: label,
      x: left + pad + indent * 22,
      y,
      size,
      weight,
      stretch: 'condensed',
      align: 'left',
      color: INK.black,
    })
    if (value) {
      drawText(layers, {
        text: value,
        x: right - pad,
        y,
        size,
        weight,
        stretch: 'condensed',
        align: 'right',
        color: INK.black,
      })
    }
  }

  // Белое поле таблицы — до конца содержимого (высота известна заранее по
  // числу строк), рамка — поверх, после текста
  const boxHeight = 56 + 12 + 34 + 14 + 30 + 42 + 12 + 24 + NUTRITION_ROWS.length * 33 + 8 + VITAMIN_ROWS.length * 34 + 26 + 22
  paint(layers, { surface: SURFACE.ink, flatten: true }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = '#ffffff'
    ctx.fillRect(left, top, width, boxHeight)
  })
  paint(layers, { surface: SURFACE.ink }, (ctx, kind) => {
    if (kind === 'color') ctx.strokeStyle = INK.black
    ctx.lineWidth = 3
    ctx.strokeRect(left, top, width, boxHeight)
  })

  let y = top + 56
  row(y, 'Nutrition Facts', '', 54, 900)
  y += 12
  rule(y, 2)
  y += 34
  row(y, 'Serving size', '1 can', 26, 800)
  y += 14
  rule(y, 11)
  y += 30
  row(y, 'Amount per serving', '', 17, 800)
  y += 42
  row(y, 'Calories', '10', 44, 900)
  y += 12
  rule(y, 6)
  y += 24
  row(y, '', '% Daily Value*', 17, 800)
  for (const item of NUTRITION_ROWS) {
    y += 7
    rule(y, 1.5)
    y += 26
    const label = item.value ? `${item.label} ${item.value}` : item.label
    row(y, label, item.percent ?? '', 21, item.bold ? 800 : 500, item.indent ?? 0)
  }
  y += 8
  rule(y, 9)
  for (const [label, percent] of VITAMIN_ROWS) {
    y += 27
    row(y, label, percent, 21, 500)
    y += 7
    rule(y, 1.5)
  }
  y += 26
  row(y, '*% Daily Value is based on a 2,000 calorie diet.', '', 15, 600)

  // Состав и "бленд" мелким сжатым шрифтом под таблицей
  const ctx = measurer()
  const smallSize = 17
  ctx.font = `700 ${smallSize}px ${FONT.sans}`
  ctx.fontStretch = 'condensed'
  let textY = top + boxHeight + 30
  for (const block of [INGREDIENTS, BLEND]) {
    for (const line of wrapLines(ctx, block, width)) {
      drawText(layers, {
        text: line,
        x: left,
        y: textY,
        size: smallSize,
        weight: 700,
        stretch: 'condensed',
        align: 'left',
        color: INK.graphite,
      })
      textY += smallSize * 1.18
    }
    textY += 10
  }

  // Залоговая маркировка тары, как на американской банке
  drawText(layers, {
    text: 'CA CRV',
    x: left,
    y: textY + 52,
    size: 64,
    weight: 900,
    stretch: 'extra-condensed',
    align: 'left',
    color: INK.black,
  })
  drawText(layers, {
    text: 'ME-VT-CT-MA-NY 5¢  MI-OR 10¢',
    x: left + 196,
    y: textY + 44,
    size: 26,
    weight: 800,
    stretch: 'condensed',
    align: 'left',
    color: INK.black,
  })
}

export function paintPanels(layers: Layers) {
  paintTopBand(layers)
  paintStoryPanel(layers)
  paintNutritionPanel(layers)
  paintFrontPanel(layers)
}
