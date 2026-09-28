import { BufferAttribute, LatheGeometry, MathUtils, Vector2, type BufferGeometry } from 'three'

// Форма банки Monster 500 мл и её нарезка на куски — чистая геометрия и
// числа, без React. Всё в условных единицах сцены: 1 ед. ≈ 53 мм, поэтому
// радиус 0.62 и высота 3.2 дают реальные пропорции "высокой" банки
// (66 × 168 мм). Ось Y — вверх, дно банки на y = 0, крышка на y = CAN_HEIGHT.

// --- Габариты ------------------------------------------------------------------

export const CAN_RADIUS = 0.62
export const CAN_HEIGHT = 3.2

// Нижний "каблук": от опорного кольца дно плавно выходит на полный радиус.
// Опорное кольцо — самая нижняя точка банки, на нём она стоит.
const HEEL_HEIGHT = 0.26
const STAND_RADIUS = 0.462

// Горлышко: плечо сужается от полного радиуса к закатке крышки
const NECK_START = CAN_HEIGHT - 0.4
const NECK_END = CAN_HEIGHT - 0.1
const NECK_RADIUS = 0.545

// Закатка (двойной шов) — чуть выступающее кольцо на самом верху. Стенка
// верхнего куска заканчивается на SEAM_TOP, дальше начинается лейза крышки.
const SEAM_RADIUS = 0.557
export const SEAM_TOP = CAN_HEIGHT - 0.012

// Толщина стенки на срезе. Реальная жесть тоньше волоса; здесь стенка
// утолщена, чтобы срез читался тонкой металлической кромкой вокруг "льда".
export const WALL_THICKNESS = 0.014

// --- Профиль стенки --------------------------------------------------------------

// Внешний радиус банки на высоте y. Кусочная функция вместо одного сплайна:
// так каждый срез точно знает радиус в месте разреза.
export function outerRadiusAt(y: number): number {
  if (y <= HEEL_HEIGHT) {
    const t = MathUtils.clamp(y / HEEL_HEIGHT, 0, 1)
    return CAN_RADIUS - (CAN_RADIUS - STAND_RADIUS) * (1 - t) ** 2
  }
  if (y <= NECK_START) return CAN_RADIUS
  if (y <= NECK_END) {
    const t = MathUtils.smoothstep(y, NECK_START, NECK_END)
    return CAN_RADIUS - (CAN_RADIUS - NECK_RADIUS) * t
  }
  // Закатка: быстрый выход на радиус шва и вертикальный поясок
  const t = MathUtils.smoothstep(y, NECK_END, NECK_END + 0.03)
  return NECK_RADIUS + (SEAM_RADIUS - NECK_RADIUS) * t
}

// Следующая точка профиля: на изгибах (каблук, горлышко, шов) шаг мелкий,
// прямой участок пропускается одним прыжком до начала горлышка или до y1
function nextProfileY(y: number, y1: number): number {
  if (y < HEEL_HEIGHT) return Math.min(y + 0.015, y1)
  if (y < NECK_START) return Math.min(NECK_START, y1)
  return Math.min(y + 0.012, y1)
}

// Точки профиля стенки от y0 до y1 для LatheGeometry
function wallProfile(y0: number, y1: number): Vector2[] {
  const points: Vector2[] = []
  let y = y0
  for (;;) {
    points.push(new Vector2(outerRadiusAt(y), y))
    if (y >= y1) break
    y = nextProfileY(y, y1)
  }
  return points
}

// Лейза с правильной UV-развёрткой под этикетку. LatheGeometry ставит uv.y
// по номеру точки профиля, а не по высоте — этикетка поехала бы на изгибах.
// Переписываем v = y / CAN_HEIGHT: текстура натягивается на всю банку
// сверху донизу одинаково для любого куска.
// phiStart = π: шов развёртки (u = 0) уходит назад, центр этикетки (u = 0.5)
// смотрит в камеру (+Z).
function latheWithHeightUv(points: Vector2[], segments: number): BufferGeometry {
  const geometry = new LatheGeometry(points, segments, Math.PI, Math.PI * 2)
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv') as BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, position.getY(i) / CAN_HEIGHT)
  }
  uv.needsUpdate = true
  return geometry
}

export function createWallGeometry(y0: number, y1: number): BufferGeometry {
  return latheWithHeightUv(wallProfile(y0, y1), 128)
}

// --- Крышка ----------------------------------------------------------------------

// Дуга профиля: центр (cr, cy), радиус, углы a0 → a1. Скругления закатки,
// канавки и опорного кольца строятся дугами — на них и ловятся тонкие
// блики, по которым глаз узнаёт настоящую банку.
function arc(cr: number, cy: number, radius: number, a0: number, a1: number, steps: number): Vector2[] {
  const points: Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    points.push(new Vector2(cr + Math.cos(a) * radius, cy + Math.sin(a) * radius))
  }
  return points
}

// Крышка в разрезе, снаружи внутрь (против часовой при взгляде сбоку —
// так нормали LatheGeometry смотрят наружу и вверх):
//  - валик двойной закатки — полукруг;
//  - внутренняя стенка ("чак") вниз к канавке-зенковке;
//  - канавка — узкая U-образная;
//  - панель крышки с кольцом жёсткости;
//  - углубление вокруг заклёпки и её "кнопка" в центре.
export function createLidGeometry(): BufferGeometry {
  const top = CAN_HEIGHT
  const points = [
    // Валик закатки: от наружной стенки через верх к внутренней
    ...arc(SEAM_RADIUS - 0.012, SEAM_TOP, 0.012, 0, Math.PI, 12),
    // Стенка вниз с лёгким наклоном внутрь
    new Vector2(0.53, top - 0.036),
    new Vector2(0.527, top - 0.057),
    // Канавка: вниз, по дну, вверх
    ...arc(0.5205, top - 0.062, 0.0065, 0, -Math.PI, 10),
    // Скругление перехода к панели
    new Vector2(0.512, top - 0.0585),
    new Vector2(0.507, top - 0.0555),
    new Vector2(0.49, top - 0.055),
    // Кольцо жёсткости — невысокий выпуклый поясок
    new Vector2(0.452, top - 0.055),
    new Vector2(0.445, top - 0.0527),
    new Vector2(0.438, top - 0.0517),
    new Vector2(0.431, top - 0.0527),
    new Vector2(0.424, top - 0.055),
    // Панель — едва заметный купол к центру
    new Vector2(0.3, top - 0.0545),
    new Vector2(0.16, top - 0.054),
    // Углубление вокруг заклёпки и сама заклёпка
    new Vector2(0.085, top - 0.054),
    new Vector2(0.075, top - 0.057),
    new Vector2(0.066, top - 0.0585),
    new Vector2(0.058, top - 0.056),
    new Vector2(0.05, top - 0.0515),
    new Vector2(0.035, top - 0.05),
    new Vector2(0.001, top - 0.0495),
  ]
  return new LatheGeometry(points, 128)
}

// Высота панели крышки — на ней лежит язычок
export const LID_PANEL_Y = CAN_HEIGHT - 0.055

// --- Дно ------------------------------------------------------------------------

// Купол дна со ступенькой и скруглённым опорным кольцом. Профиль от центра
// наружу — нормали смотрят вниз; кончается ровно там, где начинается стенка
// (нижняя точка опорного кольца).
export function createDomeGeometry(): BufferGeometry {
  const points = [
    new Vector2(0.001, 0.165),
    new Vector2(0.08, 0.162),
    new Vector2(0.16, 0.153),
    new Vector2(0.215, 0.144),
    // Ступенька-кольцо на куполе
    new Vector2(0.228, 0.139),
    new Vector2(0.236, 0.131),
    new Vector2(0.246, 0.127),
    new Vector2(0.3, 0.112),
    new Vector2(0.35, 0.092),
    new Vector2(0.395, 0.066),
    new Vector2(0.425, 0.042),
    new Vector2(0.442, 0.024),
    // Скругление опорного кольца до самой нижней точки
    ...arc(STAND_RADIUS, 0.014, 0.014, Math.PI, Math.PI * 1.5, 8),
  ]
  return new LatheGeometry(points, 128)
}

// --- Нарезка на куски --------------------------------------------------------------

// Пять кусков, как на продуктовом фото: тонкое дно, нижний кусок со всеми
// надписями (MONSTER / ENERGY / ULTRA WHITE), два средних с когтем и верх с
// горлышком и крышкой. Разрезы проходят сквозь коготь — он "продолжается"
// через щели, как на фото.
//
// tilt — наклон куска в разобранном состоянии (рад), yaw — разворот вокруг
// оси. Подобраны вручную так, чтобы куски расходились веером и верхние грани
// срезов были видны камере.
export interface CanPiece {
  id: string
  y0: number
  y1: number
  tilt: [number, number]
  yaw: number
  hasLid: boolean
  hasDome: boolean
}

export const CAN_PIECES: CanPiece[] = [
  { id: 'base', y0: 0, y1: 0.2, tilt: [0.2, -0.12], yaw: 0.2, hasLid: false, hasDome: true },
  { id: 'bottom', y0: 0.2, y1: 1.08, tilt: [0.1, 0.07], yaw: -0.14, hasLid: false, hasDome: false },
  { id: 'lower', y0: 1.08, y1: 1.78, tilt: [-0.05, -0.09], yaw: 0.16, hasLid: false, hasDome: false },
  { id: 'upper', y0: 1.78, y1: 2.46, tilt: [0.13, 0.1], yaw: -0.1, hasLid: false, hasDome: false },
  { id: 'top', y0: 2.46, y1: CAN_HEIGHT, tilt: [0.24, -0.15], yaw: 0.18, hasLid: true, hasDome: false },
]

// Зазор между кусками в разобранном состоянии
export const EXPLODE_GAP = 0.21
