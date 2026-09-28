import { LAYOUT, SURFACE, TEXTURE_HEIGHT, TEXTURE_WIDTH, paint, toCanvasY, type Layers } from './canvas'

// Основа этикетки, общая для всех банок: голый алюминий горлышка и каблука
// под всей развёрткой и тонкий серебряный кант по краям печати. Между ними
// каждая этикетка кладёт своё: Ultra White — жемчужную краску и рисунок
// (labelTexture.ts), вкусы коллекции — присланную развёртку (imageLabel.ts).

// Алюминий горлышка и каблука: светлое серебро — основной цвет металла
// всё равно даст отражение окружения
export function paintMetal(layers: Layers) {
  const { color, surface } = layers
  const metal = color.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT)
  metal.addColorStop(0, '#dfe5ea')
  metal.addColorStop(1, '#c9d1d8')
  color.fillStyle = metal
  color.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  surface.fillStyle = `rgb(255, ${Math.round(SURFACE.aluminum[0] * 255)}, 255)`
  surface.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
}

// Тонкий серебряный кант по краям печати — с лёгким тиснением
export function paintPrintEdges(layers: Layers) {
  for (const y of [toCanvasY(LAYOUT.printTop), toCanvasY(LAYOUT.printBottom)]) {
    paint(layers, { surface: SURFACE.foil, height: 0.25 }, (ctx, kind) => {
      if (kind === 'color') ctx.fillStyle = '#b9c4cd'
      ctx.fillRect(0, y - 2, TEXTURE_WIDTH, 4)
    })
  }
}
