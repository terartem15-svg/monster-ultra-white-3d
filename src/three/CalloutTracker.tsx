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

// Временные векторы кадра
const scratch = {
  point: new Vector3(),
  normal: new Vector3(),
  toCamera: new Vector3(),
  center: new Vector3(),
  edge: new Vector3(),
  right: new Vector3(),
  scale: new Vector3(),
}

// Прогресс появления выноски: линия рисуется первой, подпись — следом
function calloutProgress(scroll: number, index: number) {
  const start = PHASES.calloutsStart + index * PHASES.calloutsStep
  const fade = 1 - MathUtils.smoothstep(scroll, PHASES.calloutsFade[0], PHASES.calloutsFade[1])
  return {
    line: MathUtils.smoothstep(scroll, start, start + 0.035) * fade,
    label: MathUtils.smoothstep(scroll, start + 0.015, start + 0.05) * fade,
  }
}

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

    const toScreen = (vector: Vector3) => {
      vector.project(camera)
      return [(vector.x * 0.5 + 0.5) * size.width, (-vector.y * 0.5 + 0.5) * size.height] as const
    }

    CALLOUT_ANCHORS.forEach((anchor, index) => {
      const nodes = calloutNodes[index]
      if (!nodes) return
      const progress = calloutProgress(sceneState.scroll, index)

      // Видимость точки: нормаль в мире против направления на камеру
      scratch.point.set(...anchor.point).applyMatrix4(group.matrixWorld)
      scratch.normal.set(...anchor.normal).transformDirection(group.matrixWorld)
      scratch.toCamera.copy(camera.position).sub(scratch.point).normalize()
      const facing = MathUtils.smoothstep(scratch.normal.dot(scratch.toCamera), 0.02, 0.3)
      const lineAmount = progress.line * facing
      const labelAmount = progress.label * facing

      const visible = lineAmount > 0.001 || labelAmount > 0.001
      nodes.item.style.visibility = visible ? 'visible' : 'hidden'
      if (!visible) return

      const [x, y] = toScreen(scratch.point)

      // Край силуэта на высоте якоря: центр оси банки ± радиус вдоль
      // "вправо" камеры
      scratch.center.set(0, anchor.point[1], 0).applyMatrix4(group.matrixWorld)
      scratch.edge.copy(scratch.center).addScaledVector(scratch.right, CAN_RADIUS * scratch.scale.x)
      const [centerX] = toScreen(scratch.center)
      const [edgeX] = toScreen(scratch.edge)
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
    })
  })

  return <group ref={groupRef} />
}
