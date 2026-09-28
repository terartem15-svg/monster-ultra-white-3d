import { buildImageLabel, type ImageLabelSpec } from '../can/label/imageLabel'

// Web Worker, рисующий этикетки вкусов коллекции. Одна этикетка — это
// десятки тысяч фигур конденсата и несколько проходов по 3.4 млн пикселей
// (материал, рельеф, нормали): на странице это полсекунды-секунда, и скролл
// в это время стоял бы. Здесь та же работа идёт в фоне на OffscreenCanvas,
// а странице уходят готовые ImageBitmap — без копирования (transfer).

export interface LabelRequest {
  index: number
  url: string
  spec: ImageLabelSpec
  // Масштаб карт цвета и нормалей (на телефоне — вдвое меньше)
  scale: number
}

export type LabelResponse =
  | { index: number; ok: true; color: ImageBitmap; surface: ImageBitmap; normal: ImageBitmap }
  | { index: number; ok: false; error: string }

// Готовый слой → ImageBitmap нужного размера. Строки сразу переворачиваются:
// у текстур из ImageBitmap флаг flipY в WebGL не работает, а развёртка
// банки ждёт верх этикетки в верхней части текстуры (v = 1).
function toBitmap(source: OffscreenCanvas, scale: number): ImageBitmap {
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)
  const target = new OffscreenCanvas(width, height)
  const ctx = target.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(1, 0, 0, -1, 0, height)
  ctx.drawImage(source, 0, 0, width, height)
  return target.transferToImageBitmap()
}

self.onmessage = async (event: MessageEvent<LabelRequest>) => {
  const { index, url, spec, scale } = event.data
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Label ${url}: HTTP ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvases = buildImageLabel({ source: bitmap, width: bitmap.width, height: bitmap.height }, spec)
    bitmap.close()
    const color = toBitmap(canvases.color as OffscreenCanvas, scale)
    // Материал меняется плавно — его карте хватает половины разрешения
    const surface = toBitmap(canvases.surface as OffscreenCanvas, scale * 0.5)
    const normal = toBitmap(canvases.normal as OffscreenCanvas, scale)
    const message: LabelResponse = { index, ok: true, color, surface, normal }
    self.postMessage(message, { transfer: [color, surface, normal] })
  } catch (error) {
    const message: LabelResponse = { index, ok: false, error: error instanceof Error ? error.message : String(error) }
    self.postMessage(message)
  }
}
