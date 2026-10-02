// Мост между DOM главы «Состав» (components/InsideTags) и 3D-сценой
// (three/inside/InsideCapsules.tsx) — в обе стороны:
//
//  - DOM → 3D: «причалы». Метки ингредиентов расставляет CSS (колонка справа
//    от банки, на телефоне — у края экрана), а капсула встаёт рядом со своей
//    меткой: раскладку решает CSS, сцена под неё подстраивается — как со
//    слотом банки (hooks/useSlotTracking.ts);
//  - 3D → DOM: линия-выноска от капсулы к метке и состояние метки. Капсула
//    парит и летит в такт кадру WebGL, поэтому сцена сама пишет координаты
//    линии прямо в узлы из своего цикла — как у выносок первого экрана
//    (state/callouts.ts).

// Причал капсулы, CSS px экрана главы
export interface InsideDock {
  // Где стоит капсула, когда она у метки
  x: number
  y: number
  // Насколько текущая капсула выдвигается от метки к банке
  reach: number
  // Левый край метки — там кончается линия-выноска
  tagX: number
}

export const insideDocks: (InsideDock | null)[] = []

export interface InsideTagNodes {
  // Метка-кнопка: сцена пишет в неё --docked (капсула на месте, 0..1)
  tag: HTMLElement
  line: SVGLineElement
  dot: SVGCircleElement
}

// Узлы по порядку ингредиентов; null — компонент ещё не смонтирован
export const insideTagNodes: (InsideTagNodes | null)[] = []
