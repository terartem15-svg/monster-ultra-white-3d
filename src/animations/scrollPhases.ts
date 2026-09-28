import { smoothstep } from '@/utils/smoothstep'

// Фазы скролла по главам. Один источник для всех, кто двигается от скролла:
// DOM (animations/heroScroll.ts, lineupScroll.ts), банки и лёд
// (three/CanRig.tsx, three/lineup/*), выноски (three/CalloutTracker.tsx),
// слова за банкой (three/Backdrop.tsx). Сдвинул фазу здесь — сдвинулось
// везде синхронно.
//
// Первый экран — доли прогресса 0..1:
//
//   0 ──── сборка и оборот ──── 0.26 ──── детали и выноски ──── 0.72 ──── финал ULTRA ──── 1
export const PHASES = {
  // Карточки и заголовок разъезжаются и гаснут
  contentOut: [0.02, 0.2],
  // Куски банки сходятся в целую банку
  assemble: [0.03, 0.22],
  // Полный оборот банки — к концу она снова смотрит логотипом в камеру
  spin: [0.04, 0.26],
  // Лёд разлетается к краям кадра
  spread: [0.03, 0.3],
  // Подлёт к банке и отлёт обратно — сцена деталей
  detailIn: [0.22, 0.34],
  detailOut: [0.64, 0.74],
  // Выноски появляются по одной: первая на calloutsStart, каждая
  // следующая — через calloutsStep; гаснут все вместе
  calloutsStart: 0.32,
  calloutsStep: 0.055,
  calloutsFade: [0.6, 0.66],
  // Финал: огромное слово за банкой и подпись под ней
  word: [0.72, 0.92],
  caption: [0.86, 0.96],
} as const

// --- Глава «Коллекция» (Lineup) ------------------------------------------------
//
// Скролл главы меряется в высотах экрана (svh), а не долями: длина секции
// зависит от числа вкусов. Из этих чисел CSS получает высоту секции
// (sections/Lineup), а DOM и 3D — одинаковое положение в коллекции.
//
//   стык с Hero ── банка 0 ── переход ── банка 1 ── … ── банка N−1 ── хвост
//   |── entry ──|── step ──|── step ──|        …        |── tail ──|
//
// На телефоне (compact) шаги короче — глава заметно короче, как в плане.
export type LineupLayout = 'regular' | 'compact'

// Границы раскладки главы по ширине окна — те же, что в CSS
// (Lineup.module.css, FlavorPanel.module.css): уже compact — телефон
// (короткие шаги скролла); уже stacked — банка сверху, плашка снизу, и 3D
// ведёт очередь вниз, а улетающую банку — вверх
export const LINEUP_BREAKPOINTS = { compact: 700, stacked: 1000 } as const

export const LINEUP = {
  regular: { entry: 80, step: 62, tail: 45 },
  compact: { entry: 70, step: 48, tail: 35 },
  // Доля шага, на которой банка стоит на месте (поровну до и после отметки):
  // плашку можно спокойно прочитать, а переход — остальные 60% шага
  hold: 0.4,
  // Доли участка entry — стык с первым экраном
  handoff: {
    // ULTRA уходит, на его место встаёт слово первого вкуса
    heroWordOut: [0.05, 0.45],
    wordIn: [0.4, 0.85],
    // Банка переезжает из слота Hero в слот главы (на десктопе они совпадают)
    stage: [0.1, 0.8],
    // Очередь следующих банок выплывает из глубины
    queue: [0.25, 1],
    // Плашка и шкала проявляются
    ui: [0.35, 0.9],
    // После этой доли в меню подсвечивается Lineup
    nav: 0.5,
  },
} as const

// Весь скролл главы (без первого экрана высоты sticky-блока), svh
export function lineupDistance(layout: LineupLayout, count: number): number {
  const { entry, step, tail } = LINEUP[layout]
  return entry + step * (count - 1) + tail
}

export interface LineupState {
  // Стык с первым экраном 0..1, линейно по участку entry
  enter: number
  // Положение в коллекции 0..N−1 с остановками на каждой банке
  position: number
  // То же без остановок — для медленного доворота банки под скроллом
  raw: number
}

// Прогресс секции 0..1 → стык и положение в коллекции. out — чтобы сцена
// могла считать это каждый кадр без новых объектов
export function lineupState(
  progress: number,
  layout: LineupLayout,
  count: number,
  out: LineupState = { enter: 0, position: 0, raw: 0 },
): LineupState {
  const { entry, step } = LINEUP[layout]
  const scrolled = progress * lineupDistance(layout, count)
  out.enter = Math.min(1, Math.max(0, scrolled / entry))
  out.raw = Math.min(count - 1, Math.max(0, (scrolled - entry) / step))
  const index = Math.min(count - 2, Math.floor(out.raw))
  const half = LINEUP.hold / 2
  out.position = count < 2 ? 0 : index + smoothstep(out.raw - index, half, 1 - half)
  return out
}

// Прогресс секции, на котором банка index стоит в центре своей остановки —
// туда ведут шкала прогресса и пункт меню Lineup
export function lineupProgressFor(index: number, layout: LineupLayout, count: number): number {
  const { entry, step } = LINEUP[layout]
  return (entry + step * index) / lineupDistance(layout, count)
}
