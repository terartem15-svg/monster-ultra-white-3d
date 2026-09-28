import { CAN_HEIGHT, CAN_RADIUS, LID_PANEL_Y } from './can/canShape'

// Точки на банке, к которым тянутся линии-выноски. Координаты — в
// пространстве собранной банки с центром в начале координат (так её
// держит группа вращения в CanRig): y = высота на банке − половина высоты.
// normal — направление "наружу" в этой точке: если оно отвернулось от
// камеры, выноска гаснет, а не указывает сквозь банку.

export interface CalloutAnchor {
  point: [number, number, number]
  normal: [number, number, number]
  // С какой стороны от банки стоит подпись
  side: 'left' | 'right'
}

// Точка на стенке: угол от лицевой стороны (рад, + вправо) и высота от дна
function onWall(angle: number, height: number, side: CalloutAnchor['side']): CalloutAnchor {
  const x = Math.sin(angle)
  const z = Math.cos(angle)
  return { point: [x * CAN_RADIUS, height - CAN_HEIGHT / 2, z * CAN_RADIUS], normal: [x, 0, z], side }
}

// Порядок совпадает с CALLOUTS в content/site.ts
export const CALLOUT_ANCHORS: CalloutAnchor[] = [
  // Кольцо язычка на крышке. Нормаль — вверх и к зрителю: крышку видно,
  // пока камера смотрит на банку спереди-сверху
  { point: [0, LID_PANEL_Y + 0.012 - CAN_HEIGHT / 2, -0.24], normal: [0, 0.6, 0.8], side: 'right' },
  // Надпись ZERO SUGAR под горлышком
  onWall(0.28, 2.69, 'right'),
  // Капли конденсата на левом боку
  onWall(-0.78, 1.55, 'left'),
  // Надпись ENERGY — энергетический комплекс
  onWall(-0.3, 0.66, 'left'),
]
