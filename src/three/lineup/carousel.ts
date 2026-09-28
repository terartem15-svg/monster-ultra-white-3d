import { MathUtils } from 'three'

// Позы банок коллекции — чистая функция от "относительного номера" банки:
// rel = номер вкуса − положение в коллекции (sceneState.flavor).
//
//   rel = 0      текущая: в центре слота, лицом к камере;
//   rel = 1, 2   очередь: следующая виднеется сбоку в глубине, за ней ещё
//                одна — дальше и меньше, как стопка роботов в референсе;
//   rel = 3      за кадром в глубине — оттуда выплывает новая банка очереди;
//   rel = −1     улетела: с оборотом, к камере и за край кадра.
//
// Все координаты — в единицах композиции (группа layout в CanRig): банка
// 3.2 в высоту, та же шкала, что у слота. Когда экран узкий и высокий
// (телефон, планшет стоя), очередь уходит вниз-вправо, за плашку, а
// улетающая банка — вверх: по бокам там места нет.

export interface CanPose {
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
  visible: boolean
}

export const createPose = (): CanPose => ({ x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, visible: true })

// [x, y, z, поворот вокруг оси]: банки очереди развёрнуты лицом чуть к центру
type QueueKey = readonly [number, number, number, number]

const QUEUE_LANDSCAPE: readonly QueueKey[] = [
  [0, 0, 0, 0],
  [2.65, 0.3, -5, -0.42],
  [4.6, 0.62, -10.5, -0.68],
  [7, 0.95, -17, -0.9],
]

const QUEUE_PORTRAIT: readonly QueueKey[] = [
  [0, 0, 0, 0],
  [2.05, -1.2, -5.2, -0.42],
  [3.35, -2, -10.5, -0.68],
  [4.9, -2.8, -17, -0.9],
]

interface ExitPose {
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
}

// Улетающая банка: три четверти оборота, лёгкий крен, к камере и за кадр
const EXIT_LANDSCAPE: ExitPose = { x: -6.6, y: 1.8, z: 2.6, rotX: -0.25, rotY: -Math.PI * 1.5, rotZ: 0.55 }
const EXIT_PORTRAIT: ExitPose = { x: -1.4, y: 7.8, z: 2.6, rotX: -0.35, rotY: -Math.PI * 1.5, rotZ: 0.3 }

// Сплайн Катмулла — Рома по четырём ключам: путь банки через ключевые
// позы гладкий, без изломов на отметках очереди
function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const v0 = (p2 - p0) * 0.5
  const v1 = (p3 - p1) * 0.5
  const t2 = t * t
  const t3 = t * t2
  return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1
}

export function carouselPose(rel: number, portrait: boolean, out: CanPose): CanPose {
  out.visible = rel > -1 && rel < 2.95
  if (!out.visible) return out

  if (rel < 0) {
    // Уход: банка сначала трогается и поворачивается почти на месте, потом
    // разгоняется — кривые с разгоном (степени t), а не линейные
    const exit = portrait ? EXIT_PORTRAIT : EXIT_LANDSCAPE
    const t = -rel
    const accelerate = t * t
    out.x = exit.x * accelerate
    out.y = exit.y * t ** 1.6
    out.z = exit.z * accelerate
    out.rotX = exit.rotX * t
    out.rotY = exit.rotY * MathUtils.smootherstep(t, 0, 1)
    out.rotZ = exit.rotZ * t
    return out
  }

  const keys = portrait ? QUEUE_PORTRAIT : QUEUE_LANDSCAPE
  const last = keys.length - 1
  const index = Math.min(last - 1, Math.floor(rel))
  const t = rel - index
  const p0 = keys[Math.max(0, index - 1)]
  const p1 = keys[index]
  const p2 = keys[index + 1]
  const p3 = keys[Math.min(last, index + 2)]
  out.x = catmullRom(t, p0[0], p1[0], p2[0], p3[0])
  out.y = catmullRom(t, p0[1], p1[1], p2[1], p3[1])
  out.z = catmullRom(t, p0[2], p1[2], p2[2], p3[2])
  out.rotY = catmullRom(t, p0[3], p1[3], p2[3], p3[3])
  out.rotX = 0
  out.rotZ = 0
  return out
}

// Медленный доворот банки под скроллом: пока банка index в центре, она
// поворачивается от +0.27 до −0.27 рад — блики бегут по металлу и каплям,
// и даже на остановке сцена отвечает на скролл. raw — положение без остановок
export const holdTurn = (raw: number, index: number) => MathUtils.clamp(raw - index, -0.6, 0.6) * -0.45
