import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, type ColorSpace, type WebGLRenderer } from 'three'
import type { FlavorLabel } from '@/content/flavors'
import type { LabelMaps } from '../can/canMaterials'
import { buildImageLabel } from '../can/label/imageLabel'
import type { LabelRequest, LabelResponse } from './labelWorker'

// Этикетки вкусов коллекции: заказ, сборка, загрузка в видеопамять и
// освобождение. Одна этикетка — три текстуры (цвет, материал, нормали),
// около 40 МБ видеопамяти на десктопе, поэтому держим только банки рядом
// с текущей: LineupCans каждый кадр сообщает, какие нужны (sync), а дальние
// освобождаются.
//
// Сборка — в Web Worker (labelWorker.ts), по одной этикетке за раз и в
// порядке приоритета: сначала текущая и следующая банка. Если воркер или
// OffscreenCanvas недоступны, та же сборка идёт на странице — медленнее, но
// результат тот же.
//
// Готовые текстуры загружаются в видеопамять по одной за кадр
// (renderer.initTexture): три загрузки по ~14 МБ в одном кадре дали бы
// заметный рывок.

type Entry =
  | { state: 'queued' }
  | { state: 'building' }
  | { state: 'uploading'; maps: LabelMaps; pending: Texture[] }
  | { state: 'ready'; maps: LabelMaps }
  | { state: 'failed' }

interface StoreOptions {
  labels: (FlavorLabel | null)[]
  anisotropy: number
  // Масштаб карт: 1 — как у банки первого экрана, 0.5 — на телефоне
  scale: number
  onReady: (index: number, maps: LabelMaps) => void
  // Вызывается до освобождения текстур: материал должен успеть вернуть заглушку
  onRelease: (index: number) => void
}

// Абсолютный адрес развёртки: воркер разрешает относительные адреса от
// своего файла, а не от страницы
const labelUrl = (label: FlavorLabel) => new URL(import.meta.env.BASE_URL + label.src, window.location.href).href

// Поддерживает ли браузер рисование этикетки в воркере
const canUseWorker = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'

function prepareTexture(texture: Texture, colorSpace: ColorSpace, anisotropy: number): Texture {
  texture.colorSpace = colorSpace
  texture.wrapS = RepeatWrapping
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
  return texture
}

// Текстура из ImageBitmap воркера: строки там уже перевёрнуты, flipY не нужен
function bitmapTexture(bitmap: ImageBitmap, colorSpace: ColorSpace, anisotropy: number): Texture {
  const texture = new Texture(bitmap)
  texture.flipY = false
  return prepareTexture(texture, colorSpace, anisotropy)
}

function removeFrom(list: number[], value: number) {
  const at = list.indexOf(value)
  if (at >= 0) list.splice(at, 1)
}

function releaseMaps(maps: LabelMaps) {
  for (const texture of [maps.color, maps.surface, maps.normal]) {
    texture.dispose()
    const image: unknown = texture.image
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
  }
}

export class FlavorLabelStore {
  private readonly options: StoreOptions
  // Запись на каждый вкус по его номеру (вкусов единицы — массив, а не Map:
  // обход каждый кадр без итераторов и новых объектов)
  private readonly entries: (Entry | undefined)[] = []
  private readonly queue: number[] = []
  private building: number | null = null
  private worker: Worker | null = null
  private workerBroken = !canUseWorker()
  private disposed = false

  constructor(options: StoreOptions) {
    this.options = options
  }

  // wanted — нужные этикетки в порядке важности; keep — какие можно не
  // освобождать (чуть шире wanted: при скролле туда-обратно у границы
  // этикетка не собирается заново каждый раз)
  sync(wanted: readonly number[], keep: ReadonlySet<number>) {
    for (let index = 0; index < this.entries.length; index++) {
      const entry = this.entries[index]
      if (!entry || keep.has(index)) continue
      if (entry.state === 'ready' || entry.state === 'uploading') {
        this.options.onRelease(index)
        releaseMaps(entry.maps)
      }
      // Идущую сборку не прерываем: без записи её результат просто не примут
      this.entries[index] = undefined
    }

    // Очередь пересобирается каждый кадр — тем же массивом, без аллокаций
    this.queue.length = 0
    for (const index of wanted) {
      if (!this.options.labels[index]) continue
      this.entries[index] ??= { state: 'queued' }
      if (this.entries[index]?.state === 'queued') this.queue.push(index)
    }
    this.pump()
  }

  // Раз в кадр: одна текстура в видеопамять. Этикетка отдаётся материалу,
  // только когда загружены все три её карты
  upload(renderer: WebGLRenderer) {
    for (let index = 0; index < this.entries.length; index++) {
      const entry = this.entries[index]
      if (entry?.state !== 'uploading') continue
      const texture = entry.pending.shift()
      if (texture) renderer.initTexture(texture)
      if (entry.pending.length === 0) {
        this.entries[index] = { state: 'ready', maps: entry.maps }
        this.options.onReady(index, entry.maps)
      }
      return
    }
  }

  dispose() {
    this.disposed = true
    this.worker?.terminate()
    this.worker = null
    this.entries.forEach((entry, index) => {
      if (entry?.state === 'ready' || entry?.state === 'uploading') {
        this.options.onRelease(index)
        releaseMaps(entry.maps)
      }
    })
    this.entries.length = 0
    this.queue.length = 0
  }

  // --- Сборка --------------------------------------------------------------------

  private pump() {
    if (this.disposed || this.building !== null) return
    const index = this.queue.shift()
    if (index === undefined) return
    const label = this.options.labels[index]
    if (!label) return
    this.building = index
    this.entries[index] = { state: 'building' }
    const url = labelUrl(label)
    if (!this.workerBroken && this.startWorker()) {
      const request: LabelRequest = { index, url, spec: label, scale: this.options.scale }
      this.worker?.postMessage(request)
    } else {
      void this.buildOnPage(index, url, label)
    }
  }

  private startWorker(): boolean {
    if (this.worker) return true
    try {
      this.worker = new Worker(new URL('./labelWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      this.workerBroken = true
      return false
    }
    this.worker.onmessage = (event: MessageEvent<LabelResponse>) => this.onWorkerMessage(event.data)
    // Воркер не поднялся (старый браузер, CSP) — дальше всё на странице
    this.worker.onerror = () => {
      this.workerBroken = true
      this.worker?.terminate()
      this.worker = null
      const index = this.building
      const label = index === null ? null : this.options.labels[index]
      if (index !== null && label) {
        void this.buildOnPage(index, labelUrl(label), label)
      }
    }
    return true
  }

  private onWorkerMessage(response: LabelResponse) {
    if (response.ok) {
      const { anisotropy } = this.options
      this.accept(response.index, {
        color: bitmapTexture(response.color, SRGBColorSpace, anisotropy),
        surface: bitmapTexture(response.surface, NoColorSpace, anisotropy),
        normal: bitmapTexture(response.normal, NoColorSpace, anisotropy),
      })
      return
    }
    // Воркер отработал, но нарисовать не смог — пробуем ту же этикетку на странице
    const label = this.options.labels[response.index]
    if (label) {
      this.workerBroken = true
      void this.buildOnPage(response.index, labelUrl(label), label)
    } else {
      this.fail(response.index)
    }
  }

  // Запасной путь: та же сборка на странице, результат — CanvasTexture
  private async buildOnPage(index: number, url: string, label: FlavorLabel) {
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      if (this.disposed) return
      const canvases = buildImageLabel({ source: image, width: image.naturalWidth, height: image.naturalHeight }, label)
      const { anisotropy } = this.options
      this.accept(index, {
        color: prepareTexture(new CanvasTexture(canvases.color), SRGBColorSpace, anisotropy),
        surface: prepareTexture(new CanvasTexture(canvases.surface), NoColorSpace, anisotropy),
        normal: prepareTexture(new CanvasTexture(canvases.normal), NoColorSpace, anisotropy),
      })
    } catch {
      this.fail(index)
    }
  }

  private accept(index: number, maps: LabelMaps) {
    this.building = null
    const state = this.entries[index]?.state
    // Пока собиралась, банка ушла далеко — результат не нужен. Если за это
    // время её успели заказать снова (queued), результат как раз кстати
    if (this.disposed || (state !== 'building' && state !== 'queued')) {
      releaseMaps(maps)
    } else {
      removeFrom(this.queue, index)
      this.entries[index] = { state: 'uploading', maps, pending: [maps.color, maps.surface, maps.normal] }
    }
    this.pump()
  }

  private fail(index: number) {
    this.building = null
    if (this.entries[index]) this.entries[index] = { state: 'failed' }
    removeFrom(this.queue, index)
    this.pump()
  }
}
