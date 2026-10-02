import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
// Шрифты этикетки, которых нет на сайте: рукописный — для истории бренда,
// "потёртый" — для слогана. Только латиница: больше на банке ничего нет.
import '@fontsource/mansalva/latin-400.css'
import '@fontsource/rubik-dirt/latin-400.css'
import type { LabelMaps } from './canMaterials'
import { paintMetal, paintPrintEdges } from './label/base'
import { LAYOUT, SURFACE, TEXTURE_WIDTH, createLayers, paint, toCanvasY, type Layers } from './label/canvas'
import { paintOrnament } from './label/ornament'
import { paintPanels } from './label/panels'
import { addPaintGrain, createNormalCanvas } from './label/relief'

// Этикетка Monster Ultra White, нарисованная в canvas при загрузке. Готовой
// текстуры банки нет — есть продуктовое фото, развёртка старой этикетки
// Ultra и фото оборота настоящей банки. По ним собран свой вариант: лицевая
// сторона как на фото Ultra White (ледяной коготь, MONSTER / ENERGY /
// ULTRA WHITE), по кругу — серебряный орнамент лоз и брызг, панель истории
// бренда со штрихкодом и панель пищевой ценности, как у оригинала.
//
// Слои рисуются в три холста одной развёртки (label/canvas.ts), из них
// получаются три текстуры:
//  - color — цвет этикетки (sRGB);
//  - surface — материал: G = шероховатость, B = металличность. Орнамент,
//    фольга и голый алюминий — металл, краска — нет;
//  - normal — рельеф: тиснение когтя и надписей, зерно краски.
//
// Порядок слоёв — снизу вверх: основа → орнамент → надписи. Этикетка
// «сухая»: капли и иней кладёт поверх неё шейдер (cold/coldSurface.ts).

// --- Основа: голый алюминий и жемчужная краска --------------------------------------

function paintBase(layers: Layers) {
  const printTopY = toCanvasY(LAYOUT.printTop)
  const printBottomY = toCanvasY(LAYOUT.printBottom)
  paintMetal(layers)

  // Жемчужно-белая краска корпуса: спереди чистый белый, к задней стороне
  // чуть холоднее — банка не выглядит плоской даже без света
  const pearl = layers.color.createLinearGradient(0, 0, TEXTURE_WIDTH, 0)
  pearl.addColorStop(0, '#edf2f6')
  pearl.addColorStop(0.3, '#f7f9fb')
  pearl.addColorStop(0.5, '#fbfdfe')
  pearl.addColorStop(0.7, '#f7f9fb')
  pearl.addColorStop(1, '#edf2f6')
  paint(layers, { surface: SURFACE.paint }, (ctx, kind) => {
    if (kind === 'color') ctx.fillStyle = pearl
    ctx.fillRect(0, printTopY, TEXTURE_WIDTH, printBottomY - printTopY)
  })

  paintPrintEdges(layers)
}

// --- Сборка ---------------------------------------------------------------------------------

// Три карты одной развёртки — тот же набор, что у этикеток вкусов коллекции
export type CanLabel = LabelMaps

async function waitForFonts() {
  if (!('fonts' in document)) return
  await Promise.all([
    document.fonts.load('820 expanded 100px "Archivo Variable"', 'ULTRA WHITE ENERGY ZERO SUGAR'),
    document.fonts.load('800 condensed 40px "Archivo Variable"', 'Nutrition Facts 0123456789'),
    document.fonts.load('400 30px "Mansalva"', 'Cold runs in the family'),
    document.fonts.load('400 52px "Rubik Dirt"', 'Unleash the Ultra Beast!'),
  ])
}

function createTexture(canvas: HTMLCanvasElement | OffscreenCanvas, isColor: boolean): Texture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = isColor ? SRGBColorSpace : NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.anisotropy = 8
  return texture
}

// Этикетка рисуется один раз на всё приложение: промис кэшируется, и все
// куски банки делят одни и те же текстуры
let labelPromise: Promise<CanLabel> | null = null

export function loadCanLabel(): Promise<CanLabel> {
  labelPromise ??= waitForFonts().then(() => {
    const layers = createLayers()
    paintBase(layers)
    paintOrnament(layers)
    paintPanels(layers)
    addPaintGrain(layers)
    const normal = createNormalCanvas(layers)
    return {
      color: createTexture(layers.color.canvas, true),
      surface: createTexture(layers.surface.canvas, false),
      normal: createTexture(normal, false),
    }
  })
  return labelPromise
}
