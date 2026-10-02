import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, Vector3, type Group } from 'three'
import { PHASES } from '@/animations/scrollPhases'
import { calloutNodes } from '@/state/callouts'
import { CAN_RADIUS } from './can/canShape'
import { CALLOUT_ANCHORS } from './calloutAnchors'
import { sceneState } from './sceneState'

// Ведёт DOM-выноски за банкой. Стоит внутри группы вращения банки (CanRig),
// поэтому точки-якоря поворачиваются вместе с ней. Каждый кадр:
//  - проецирует якорь на экран — туда ставится точка на банке;
//  - находит край силуэта банки на этой высоте — подпись встаёт сбоку от
//    него, линия идёт от точки к подписи с изломом;
//  - по фазе скролла рисует линию (stroke-dashoffset) и проявляет подпись;
//  - гасит выноску, если её точка ушла на невидимую сторону банки.

// Отступ подписи от силуэта банки (доля ширины экрана, в пределах) и длина
// горизонтального "хвоста" линии, px. На телефоне отступ меньше — места мало.
const GAP_RATIO = 0.045
const GAP_MIN = 18
const GAP_MAX = 64
const TAIL = 22

// Временные объекты кадра — в useFrame ничего не создаётся
const scratch = {
  point: new Vector3(),
  normal: new Vector3(),
  toCamera: new Vector3(),
  center: new Vector3(),
  edge: new Vector3(),
  right: new Vector3(),
  scale: new Vector3(),
  progress: { line: 0, label: 0 },
}

// Прогресс появления выноски: линия рисуется первой, подпись — следом
function calloutProgress(scroll: number, index: number) {
  const start = PHASES.calloutsStart + index * PHASES.calloutsStep
  const fade = 1 - MathUtils.smoothstep(scroll, PHASES.calloutsFade[0], PHASES.calloutsFade[1])
  const out = scratch.progress
  out.line = MathUtils.smoothstep(scroll, start, start + 0.035) * fade
  out.label = MathUtils.smoothstep(scroll, start + 0.015, start + 0.05) * fade
  return out
}

// Видимость узла — только при смене: значение то же почти каждый кадр
function setVisibility(element: HTMLElement | SVGElement, visible: boolean) {
  const value = visible ? 'visible' : 'hidden'
  if (element.style.visibility !== value) element.style.visibility = value
}

// Точка сцены → экран: x и y в CSS px (вектор при этом портится — он временный)
const screenX = (vector: Vector3, width: number) => (vector.x * 0.5 + 0.5) * width
const screenY = (vector: Vector3, height: number) => (-vector.y * 0.5 + 0.5) * height

export function CalloutTracker() {
  const groupRef = useRef<Group>(null)

  useFrame((state) => {
    const group = groupRef.current
    if (!group) return
    const { camera, size } = state
    group.updateWorldMatrix(true, false)
    group.getWorldScale(scratch.scale)
    // Вектор "вправо" камеры — по нему откладывается радиус банки на экране
    scratch.right.set(1, 0, 0).applyQuaternion(camera.quaternion)

    for (let index = 0; index < CALLOUT_ANCHORS.length; index++) {
      const anchor = CALLOUT_ANCHORS[index]
      const nodes = calloutNodes[index]
      if (!nodes) continue
      const progress = calloutProgress(sceneState.scroll, index)

      // Видимость точки: нормаль в мире против направления на камеру
      scratch.point.fromArray(anchor.point).applyMatrix4(group.matrixWorld)
      scratch.normal.fromArray(anchor.normal).transformDirection(group.matrixWorld)
      scratch.toCamera.copy(camera.position).sub(scratch.point).normalize()
      const facing = MathUtils.smoothstep(scratch.normal.dot(scratch.toCamera), 0.02, 0.3)
      const lineAmount = progress.line * facing
      const labelAmount = progress.label * facing

      // Погасшая выноска прячется целиком — и подпись, и линия с точками:
      // при быстром скролле (или без сглаживания, «уменьшить движение»)
      // последний нарисованный кадр линии иначе остался бы на экране
      const visible = lineAmount > 0.001 || labelAmount > 0.001
      setVisibility(nodes.item, visible)
      setVisibility(nodes.line, visible)
      setVisibility(nodes.dot, visible)
      setVisibility(nodes.pulse, visible)
      if (!visible) continue

      scratch.point.project(camera)
      const x = screenX(scratch.point, size.width)
      const y = screenY(scratch.point, size.height)

      // Край силуэта на высоте якоря: центр оси банки ± радиус вдоль
      // "вправо" камеры
      scratch.center.set(0, anchor.point[1], 0).applyMatrix4(group.matrixWorld)
      scratch.edge.copy(scratch.center).addScaledVector(scratch.right, CAN_RADIUS * scratch.scale.x)
      const centerX = screenX(scratch.center.project(camera), size.width)
      const edgeX = screenX(scratch.edge.project(camera), size.width)
      const halfWidth = Math.abs(edgeX - centerX)
      const direction = anchor.side === 'right' ? 1 : -1
      const gap = MathUtils.clamp(size.width * GAP_RATIO, GAP_MIN, GAP_MAX)
      const labelX = centerX + direction * (halfWidth + gap)
      const labelY = MathUtils.clamp(y, 90, size.height - 40)

      // Линия: от точки к излому у подписи и короткий горизонтальный хвост
      const elbowX = labelX - direction * TAIL
      const endX = labelX - direction * 6
      nodes.line.setAttribute('points', `${x},${y} ${elbowX},${labelY} ${endX},${labelY}`)
      const length = Math.hypot(elbowX - x, labelY - y) + Math.abs(endX - elbowX)
      nodes.line.style.strokeDasharray = `${length}`
      nodes.line.style.strokeDashoffset = `${length * (1 - lineAmount)}`
      nodes.dot.setAttribute('cx', `${x}`)
      nodes.dot.setAttribute('cy', `${y}`)
      nodes.pulse.setAttribute('cx', `${x}`)
      nodes.pulse.setAttribute('cy', `${y}`)
      nodes.dot.style.opacity = `${lineAmount}`
      nodes.pulse.style.opacity = `${lineAmount}`

      // Подпись: слева от банки выравнивается по правому краю
      nodes.label.dataset.side = anchor.side
      const space = direction === 1 ? size.width - labelX - 12 : labelX - 12
      nodes.label.style.maxWidth = `${Math.max(84, space)}px`
      nodes.label.dataset.compact = space < 170 ? 'true' : 'false'
      nodes.label.style.opacity = `${labelAmount}`
      nodes.label.style.transform = `translate3d(${labelX}px, ${labelY}px, 0) translate(${direction === 1 ? '0' : '-100%'}, -50%) translateY(${(1 - labelAmount) * 8}px)`
    }
  })

  return <group ref={groupRef} />
}
