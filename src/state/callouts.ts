// Мост между DOM-выносками (components/Callouts) и 3D-сценой
// (three/CalloutTracker.tsx). Подписи и линии — обычный DOM и SVG: текст
// чёткий, доступен скринридеру. Но двигать их нужно в такт кадру WebGL,
// иначе линия отставала бы от точки на банке, — поэтому сцена сама пишет
// координаты прямо в эти узлы из своего цикла кадра.

export interface CalloutNodes {
  item: HTMLElement
  label: HTMLElement
  line: SVGPolylineElement
  dot: SVGCircleElement
  pulse: SVGCircleElement
}

// Узлы по порядку выносок; null — компонент ещё не смонтирован
export const calloutNodes: (CalloutNodes | null)[] = []
