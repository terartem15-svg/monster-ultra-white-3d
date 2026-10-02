import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CapsuleGeometry,
  Color,
  MathUtils,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type PerspectiveCamera,
} from 'three'
import { INSIDE, capsuleOut } from '@/animations/scrollPhases'
import { INGREDIENTS } from '@/content/inside'
import { insideDocks, insideTagNodes } from '@/state/inside'
import { motion } from '@/state/motion'
import { smoothstep } from '@/utils/smoothstep'
import { FLOAT_SPEED } from '../float'
import { heroCanRoot, sceneState } from '../sceneState'

// Капсулы главы «Состав» — по одной на ингредиент. Пока банка стеклянная,
// они лежат внутри неё наклонной стопкой; по скроллу верхняя поднимается
// через горлышко, описывает дугу и встаёт у своей метки, а остальные
// подтягиваются на ступеньку выше. На последнем переходе капсулы тем же
// путём возвращаются в банку — с конца, и стопка складывается в исходном
// порядке.
//
// Капсула живёт сразу в двух пространствах: в банке — в координатах банки
// (наклоняется и покачивается вместе с ней), у метки — в координатах экрана
// (место задаёт CSS-раскладка меток, state/inside.ts). Поэтому капсулы висят
// в корне сцены, а каждая точка пути считается в мировых координатах.
//
// Капсула — стеклянная оболочка с преломлением и цветное наполнение внутри.
// Наполнение непрозрачное: только такие объекты видны сквозь стекло оболочки
// (буфер преломления three.js). Все оболочки — один InstancedMesh, все
// наполнения — второй: два вызова отрисовки на главу, цвет — у экземпляра.

const COUNT = INGREDIENTS.length

// --- Форма, ед. банки (банка 3.2 в высоту, радиус 0.62) ------------------------------

const SHELL = { radius: 0.15, body: 0.32 }
// Наполнение заметно тоньше оболочки: стекло ещё и увеличивает его, а
// прозрачный край капсулы должен читаться
const CORE = { radius: 0.072, body: 0.26 }

// --- Стопка в банке ------------------------------------------------------------------

// Ступенька s (0 — верхняя, следующая на выход): капсулы лежат с одинаковым
// наклоном, как пилюли в тубе, и чуть змейкой от оси. Наклон у всех один:
// когда стопка подтягивается на ступеньку, капсулы не поворачиваются и не
// задевают друг друга
const STACK = { top: 0.98, gap: 0.5, sway: 0.1, tilt: 1.05 }

// --- Полёт ---------------------------------------------------------------------------

// Путь — кубическая кривая Безье: из стопки вертикально вверх через
// горлышко (первая опорная точка — над банкой на оси) и сверху вниз к метке
// (вторая — над причалом, чуть ближе к зрителю)
const RISE = 1.75
const APPROACH = { x: -0.25, y: 1.1, z: 0.5 }
// В полёте капсула делает полный оборот в плоскости экрана и чуть подрастает
const TUMBLE = Math.PI * 2
const FLIGHT_GROW = 0.22

// --- У метки -------------------------------------------------------------------------

// Наклон капсулы у метки (рад от вертикали) — почти лежит, «носом» к метке
const DOCK_TILT = -1.15
// Размер относительно капсулы в банке: у метки — мельче, текущая — крупнее
const PARKED_SCALE = 0.78
const ACTIVE_SCALE = 1.2
// Покачивание у метки: вверх-вниз (ед. банки) и наклон (рад)
const BOB = 0.035
const WOBBLE = 0.1
// Текущая капсула — та, чья остановка ближе: вес гаснет к середине перехода
const FOCUS_RANGE: [number, number] = [0.3, 0.75]
// Наполнение текущей капсулы ярче
const FOCUS_GLOW = 0.35

// --- Линия-выноска -------------------------------------------------------------------

// Зазоры линии от капсулы и от метки, px; короче MIN_LINE линию не рисуем
const LINE_GAP = 7
const TAG_GAP = 8
const MIN_LINE = 10
// Линия рисуется, когда капсула уже подлетает к метке
const LINE_IN: [number, number] = [0.82, 1]
const DOCKED_IN: [number, number] = [0.6, 1]

// При "уменьшить движение" первая капсула выходит разом — на середине своего
// участка стыка
const FIRST_SNAP = (INSIDE.handoff.first[0] + INSIDE.handoff.first[1]) / 2

// --- Материалы -----------------------------------------------------------------------

// Оболочка — стекло: полное пропускание, ior как у стекла, лак для резкого
// блика. Лёгкий оттенок — из цвета экземпляра
function createShellMaterial() {
  return new MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    thickness: 0.24,
    roughness: 0.03,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
  })
}

// Наполнение — глянцевый «гель» цвета ингредиента
function createCoreMaterial() {
  return new MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0 })
}

// Оттенок стекла оболочки: белый с долей цвета ингредиента
const SHELL_TINT = 0.22
const WHITE = new Color('#ffffff')
const CORE_COLORS = INGREDIENTS.map((ingredient) => new Color(ingredient.color))
const SHELL_COLORS = CORE_COLORS.map((color) => WHITE.clone().lerp(color, SHELL_TINT))

// --- Временные объекты кадра ---------------------------------------------------------

const frame = {
  matrix: new Matrix4(),
  position: new Vector3(),
  scale: new Vector3(),
  quaternion: new Quaternion(),
  roll: new Quaternion(),
  lean: new Quaternion(),
  canPosition: new Vector3(),
  canQuaternion: new Quaternion(),
  canScale: new Vector3(),
  home: new Vector3(),
  lift: new Vector3(),
  approach: new Vector3(),
  dock: new Vector3(),
  screen: new Vector3(),
  color: new Color(),
}

const IDENTITY = new Quaternion()
const AXIS_Z = new Vector3(0, 0, 1)
const AXIS_X = new Vector3(1, 0, 0)

// Кубическая кривая Безье по четырём точкам, результат — в out
function bezier(out: Vector3, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number) {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  )
}

// Что уже записано в метку — чтобы не трогать стили, пока значение то же.
// По самому узлу, а не по номеру: после перемонтирования узел новый и пустой
const written = new WeakMap<HTMLElement, number>()

// Насколько капсула у своей метки, 0..1 — в CSS-переменную метки
function writeDocked(tag: HTMLElement, value: number) {
  const rounded = Math.round(value * 100) / 100
  if (written.get(tag) === rounded) return
  written.set(tag, rounded)
  tag.style.setProperty('--docked', `${rounded}`)
}

// Линии и состояние меток спрятать — капсул на сцене нет
function resetTags() {
  for (const nodes of insideTagNodes) {
    if (!nodes) continue
    nodes.line.style.opacity = '0'
    nodes.dot.style.opacity = '0'
    writeDocked(nodes.tag, 0)
  }
}

export function InsideCapsules() {
  const shellRef = useRef<InstancedMesh>(null)
  const coreRef = useRef<InstancedMesh>(null)
  // Показаны ли сейчас линии — чтобы не трогать DOM каждый кадр вне главы
  const tagsLive = useRef(false)

  const geometries = useMemo(
    () => ({
      shell: new CapsuleGeometry(SHELL.radius, SHELL.body, 12, 32),
      core: new CapsuleGeometry(CORE.radius, CORE.body, 8, 20),
    }),
    [],
  )
  const materials = useMemo(() => ({ shell: createShellMaterial(), core: createCoreMaterial() }), [])

  // Цвета экземпляров задаются сразу: от их наличия зависит программа
  // шейдера, а она должна собраться при загрузке вместе со всеми
  // (Scene.tsx, ReadySignal), а не посреди скролла. Layout-эффект: первый
  // кадр R3F может прийти раньше обычных эффектов, и в нём собрался бы
  // лишний вариант программы — без цветов
  useLayoutEffect(() => {
    const shell = shellRef.current
    const core = coreRef.current
    if (!shell || !core) return
    for (let index = 0; index < COUNT; index++) {
      shell.setColorAt(index, SHELL_COLORS[index])
      core.setColorAt(index, CORE_COLORS[index])
    }
  }, [])

  // Геометрия и материалы созданы вручную — освобождаем сами
  useEffect(() => {
    return () => {
      geometries.shell.dispose()
      geometries.core.dispose()
      materials.shell.dispose()
      materials.core.dispose()
    }
  }, [geometries, materials])

  useFrame((state) => {
    const shell = shellRef.current
    const core = coreRef.current
    const root = heroCanRoot.current
    if (!shell || !core) return

    // Капсулы существуют, только пока банка стеклянная: в обычной их не видно.
    // Наполнение прячем числом экземпляров, а не visible: меш всегда в списке
    // отрисовки, и его вариант для буфера преломления (без тонмаппинга)
    // собирается ещё под прелоадером, а не в тот кадр, когда капсулы впервые
    // появятся. Оболочки в этот буфер не рисуются — их можно выключить, и
    // без капсул, капель и льда в кадре проход преломления не нужен вовсе
    const present = root !== null && sceneState.glass > 0.001
    shell.visible = present
    core.count = present ? COUNT : 0
    if (!present) {
      if (tagsLive.current) {
        tagsLive.current = false
        resetTags()
      }
      return
    }
    tagsLive.current = true

    const reduced = motion.reducedMotion
    const time = state.clock.elapsedTime
    const { calm, ingredient, ingredientLook, insideEnter } = sceneState
    const enter = reduced ? (insideEnter >= FIRST_SNAP ? 1 : 0) : insideEnter
    const look = reduced ? ingredient : ingredientLook
    // Метки гаснут в начале возврата капсул — линии гаснут вместе с ними
    const seal = MathUtils.clamp(ingredient - (COUNT - 1), 0, 1)
    const tagsIn = 1 - smoothstep(seal, INSIDE.seal.tags[0], INSIDE.seal.tags[1])

    // Пространство банки и перевод CSS-пикселей экрана в мировые единицы на
    // плоскости z = 0 (камера смотрит вдоль -Z на начало координат)
    root.updateWorldMatrix(true, false)
    root.matrixWorld.decompose(frame.canPosition, frame.canQuaternion, frame.canScale)
    const unit = frame.canScale.x
    const camera = state.camera as PerspectiveCamera
    const { width, height } = state.size
    const unitsPerPx = (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z) / height

    // Сколько капсул с меньшими номерами уже вышло — на столько ступенек
    // выше в стопке стоит текущая
    let ahead = 0
    for (let index = 0; index < COUNT; index++) {
      const dock = insideDocks[index] ?? null
      // Без причала (метки ещё не измерены) капсула остаётся в банке
      const out = dock ? capsuleOut(index, enter, ingredient, COUNT) : 0
      const slot = index - ahead
      ahead += out
      const ease = MathUtils.smootherstep(out, 0, 1)
      const focus = ease * (1 - smoothstep(Math.abs(look - index), FOCUS_RANGE[0], FOCUS_RANGE[1]))

      // Место в стопке и точка над банкой — в пространстве банки
      const stackY = STACK.top - STACK.gap * slot
      frame.home.set(STACK.sway * Math.cos(Math.PI * slot), stackY, 0).applyMatrix4(root.matrixWorld)
      frame.lift.set(0, stackY + RISE, 0).applyMatrix4(root.matrixWorld)

      // Причал — из раскладки меток; текущая капсула выдвигается к банке
      if (dock) {
        const bob = Math.sin(time * FLOAT_SPEED + index * 1.7) * BOB * unit * calm
        frame.dock.set(
          (dock.x - dock.reach * focus - width / 2) * unitsPerPx,
          -(dock.y - height / 2) * unitsPerPx + bob,
          0,
        )
      } else {
        frame.dock.copy(frame.home)
      }
      frame.approach.set(frame.dock.x + APPROACH.x * unit, frame.dock.y + APPROACH.y * unit, frame.dock.z + APPROACH.z * unit)
      bezier(frame.position, frame.home, frame.lift, frame.approach, frame.dock, ease)

      // Ориентация: в банке — её наклон и наклон стопки, у метки — свой
      // наклон и лёгкое покачивание; между ними — оборот в плоскости экрана
      const wobble = Math.sin(time * 0.7 + index * 2.1) * WOBBLE * calm * ease
      const angle = MathUtils.lerp(STACK.tilt, DOCK_TILT - TUMBLE, ease) + wobble
      frame.roll.setFromAxisAngle(AXIS_Z, angle)
      frame.lean.setFromAxisAngle(AXIS_X, Math.sin(time * 0.5 + index * 1.3) * 0.18 * calm * ease)
      frame.quaternion.copy(frame.canQuaternion).slerp(IDENTITY, ease).multiply(frame.roll).multiply(frame.lean)

      const docked = MathUtils.lerp(PARKED_SCALE, ACTIVE_SCALE, focus)
      const size = unit * MathUtils.lerp(1, docked, ease) * (1 + FLIGHT_GROW * Math.sin(Math.PI * ease))
      frame.scale.setScalar(size)
      frame.matrix.compose(frame.position, frame.quaternion, frame.scale)
      shell.setMatrixAt(index, frame.matrix)
      core.setMatrixAt(index, frame.matrix)
      core.setColorAt(index, frame.color.copy(CORE_COLORS[index]).multiplyScalar(1 + FOCUS_GLOW * focus))

      // Линия-выноска и состояние метки — прямо в DOM, в такт кадру
      const nodes = insideTagNodes[index]
      if (!nodes || !dock) continue
      writeDocked(nodes.tag, smoothstep(out, DOCKED_IN[0], DOCKED_IN[1]))
      frame.screen.copy(frame.position).project(camera)
      const x = (frame.screen.x * 0.5 + 0.5) * width
      const y = (-frame.screen.y * 0.5 + 0.5) * height
      // Горизонтальный габарит наклонённой капсулы на экране
      const reachX = (((SHELL.body / 2) * Math.abs(Math.sin(DOCK_TILT)) + SHELL.radius) * size) / unitsPerPx
      const fromX = x + reachX + LINE_GAP
      const toX = dock.tagX - TAG_GAP
      const amount = toX - fromX > MIN_LINE ? smoothstep(out, LINE_IN[0], LINE_IN[1]) * tagsIn : 0
      nodes.line.style.opacity = amount > 0.001 ? '1' : '0'
      nodes.dot.style.opacity = `${amount}`
      if (amount <= 0.001) continue
      const length = Math.hypot(toX - fromX, dock.y - y)
      nodes.line.setAttribute('x1', fromX.toFixed(1))
      nodes.line.setAttribute('y1', y.toFixed(1))
      nodes.line.setAttribute('x2', toX.toFixed(1))
      nodes.line.setAttribute('y2', dock.y.toFixed(1))
      nodes.line.style.strokeDasharray = `${length}`
      nodes.line.style.strokeDashoffset = `${length * (1 - amount)}`
      nodes.dot.setAttribute('cx', fromX.toFixed(1))
      nodes.dot.setAttribute('cy', y.toFixed(1))
    }
    shell.instanceMatrix.needsUpdate = true
    core.instanceMatrix.needsUpdate = true
    if (core.instanceColor) core.instanceColor.needsUpdate = true
  })

  return (
    <>
      {/* Наполнение рисуется раньше оболочек само: оно непрозрачное */}
      <instancedMesh ref={coreRef} args={[geometries.core, materials.core, COUNT]} count={0} frustumCulled={false} dispose={null} />
      <instancedMesh ref={shellRef} args={[geometries.shell, materials.shell, COUNT]} visible={false} frustumCulled={false} dispose={null} />
    </>
  )
}
