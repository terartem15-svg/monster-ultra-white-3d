import { smoothstep } from '@/utils/smoothstep'

// Фазы скролла по главам. Один источник для всех, кто двигается от скролла:
// DOM (animations/heroScroll.ts, lineupScroll.ts, coldScroll.ts,
// insideScroll.ts, finalScroll.ts), банки и лёд (three/CanRig.tsx,
// three/lineup/*), выноски (three/CalloutTracker.tsx), слова за банкой
// (three/Backdrop.tsx), иней и капли на банке (three/can/cold/*), стеклянная
// банка и капсулы (three/can/glass.ts, three/inside/*), иней на экране
// финала (three/final/*). Сдвинул фазу здесь — сдвинулось везде синхронно.
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

// --- Главы с остановками -------------------------------------------------------
//
// Коллекция, Холод, Состав и финал устроены одинаково: скролл меряется в высотах экрана
// (svh), а не долями — длина секции зависит от числа остановок. Из этих
// чисел CSS получает высоту секции, а DOM и 3D — одинаковое положение в главе.
//
//   стык с прошлой главой ── остановка 0 ── переход ── остановка 1 ── … ── хвост
//   |──────── entry ────────|──── step ────|──── step ────|    …    |── tail ──|
//
// На каждой остановке — пауза (hold): доля шага, на которой всё стоит на
// месте (поровну до и после отметки), переход — остальная часть шага.
// На телефоне (compact) шаги короче — глава заметно короче.
export type ChapterLayout = 'regular' | 'compact'

interface ChapterNumbers {
  entry: number
  step: number
  tail: number
}

export interface ChapterState {
  // Стык с прошлой главой 0..1, линейно по участку entry
  enter: number
  // Положение 0..N−1 с остановками на каждой отметке
  position: number
  // То же без остановок — для медленного доворота банки под скроллом
  raw: number
}

// Весь скролл главы (без первого экрана высоты sticky-блока), svh
function chapterDistance({ entry, step, tail }: ChapterNumbers, count: number): number {
  return entry + step * (count - 1) + tail
}

// Прогресс секции 0..1 → стык и положение в главе. out — чтобы сцена могла
// считать это каждый кадр без новых объектов
function chapterState(progress: number, numbers: ChapterNumbers, count: number, hold: number, out: ChapterState): ChapterState {
  const { entry, step } = numbers
  const scrolled = progress * chapterDistance(numbers, count)
  out.enter = Math.min(1, Math.max(0, scrolled / entry))
  out.raw = Math.min(count - 1, Math.max(0, (scrolled - entry) / step))
  const index = Math.min(count - 2, Math.floor(out.raw))
  const half = hold / 2
  out.position = count < 2 ? 0 : index + smoothstep(out.raw - index, half, 1 - half)
  return out
}

// Прогресс секции, на котором остановка index стоит в центре своей паузы
function chapterProgressFor(index: number, numbers: ChapterNumbers, count: number): number {
  return (numbers.entry + numbers.step * index) / chapterDistance(numbers, count)
}

// --- Глава «Коллекция» (Lineup) ------------------------------------------------
//
//   стык с Hero ── банка 0 ── переход ── банка 1 ── … ── банка N−1 ── хвост
export type LineupLayout = ChapterLayout

// Границы раскладки главы по ширине окна — те же, что в CSS
// (Lineup.module.css, FlavorPanel.module.css): уже compact — телефон
// (короткие шаги скролла); уже stacked — банка сверху, плашка снизу, и 3D
// ведёт очередь вниз, а улетающую банку — вверх
export const LINEUP_BREAKPOINTS = { compact: 700, stacked: 1000 } as const

// Низкий экран — телефон лёжа: столбиком (банка сверху, плашка снизу) сюда
// не помещается, и у глав своя раскладка — банка и плашка рядом (CSS: тот же
// запрос). 3D решает по той же границе, что CSS
export const LOW_SCREEN = { maxHeight: 520 } as const
export const LOW_SCREEN_QUERY = `(max-height: ${LOW_SCREEN.maxHeight}px) and (orientation: landscape)`
export const isLowScreen = (width: number, height: number) => height <= LOW_SCREEN.maxHeight && width > height

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

export type LineupState = ChapterState

export function lineupDistance(layout: LineupLayout, count: number): number {
  return chapterDistance(LINEUP[layout], count)
}

// Положение в коллекции: position — номер банки с остановками
export function lineupState(
  progress: number,
  layout: LineupLayout,
  count: number,
  out: LineupState = { enter: 0, position: 0, raw: 0 },
): LineupState {
  return chapterState(progress, LINEUP[layout], count, LINEUP.hold, out)
}

// Банка index в центре своей остановки — туда ведут шкала и пункт меню Lineup
export function lineupProgressFor(index: number, layout: LineupLayout, count: number): number {
  return chapterProgressFor(index, LINEUP[layout], count)
}

// --- Глава «Холод» ------------------------------------------------------------------
//
// Та же механика: стык с коллекцией и три остановки — сухая банка, в каплях,
// в инее (температуры и тексты — content/cold.ts). Между остановками банка
// остывает: положение в главе переводится в температуру (coldTemperature),
// а из температуры сцена выводит влажность и иней.
//
//   стык ── 22 °C ── остывание ── 2 °C ── остывание ── −4 °C ── хвост
export const COLD = {
  regular: { entry: 90, step: 75, tail: 40 },
  compact: { entry: 75, step: 58, tail: 30 },
  // Пауза короче, чем в коллекции: здесь самое интересное — сам переход
  hold: 0.35,
  // Доли участка entry — стык с коллекцией
  handoff: {
    // Фон темнеет до ночного синего, цветная подсветка становится ледяной
    dark: [0.06, 0.7],
    // Банка «согревается» до комнатной: капли высыхают, иней тает
    dry: [0.12, 0.72],
    // Лёд и капли в воздухе уходят за края кадра
    clear: [0.04, 0.5],
    // Банка переезжает в слот главы (и чуть подрастает — камера «подходит»)
    stage: [0.1, 0.85],
    // Шкала и плашка проявляются
    ui: [0.45, 0.95],
    // Шапка переходит на светлый текст, когда фон под ней уже тёмный
    theme: 0.38,
    // После этой доли глава считается текущей (для меню)
    nav: 0.5,
  },
  // Форма остывания на каждом переходе: степень > 1 — температура сначала
  // падает быстро. Первый переход проскакивает «сухой» участок 22 → 14 °C,
  // второй — 2 → 0 °C, и почти весь скролл уходит на то, что видно: рост
  // капель и инея. К середине перехода (где плашка меняет текст) иней уже идёт
  cooling: [1.6, 1.6],
} as const

export type ColdState = ChapterState

export function coldDistance(layout: ChapterLayout, count: number): number {
  return chapterDistance(COLD[layout], count)
}

export function coldState(
  progress: number,
  layout: ChapterLayout,
  count: number,
  out: ColdState = { enter: 0, position: 0, raw: 0 },
): ColdState {
  return chapterState(progress, COLD[layout], count, COLD.hold, out)
}

// Остановка index в центре своей паузы — туда ведут отметки шкалы
export function coldProgressFor(index: number, layout: ChapterLayout, count: number): number {
  return chapterProgressFor(index, COLD[layout], count)
}

// Положение в главе → температура банки, °C (stops — температуры остановок)
export function coldTemperature(position: number, stops: readonly number[]): number {
  const last = stops.length - 1
  const index = Math.min(last - 1, Math.max(0, Math.floor(position)))
  const t = Math.min(1, Math.max(0, position - index))
  const shape = COLD.cooling[index] ?? 1
  return stops[index] + (stops[index + 1] - stops[index]) * (1 - (1 - t) ** shape)
}

// --- Глава «Состав» (What's inside) -------------------------------------------------
//
// Та же механика: стык с «Холодом», по остановке на ингредиент и итоговая
// остановка. На стыке ночь рассеивается, синяя банка улетает, возвращается
// Ultra White и становится стеклянной; дальше на каждом переходе из банки
// поднимается очередная капсула, а на последнем все возвращаются обратно, и
// банка снова непрозрачная (three/inside/*, тексты — content/inside.ts).
//
//   стык ── капсула 0 ── капсула 1 ── … ── капсула N−1 ── итог ── хвост
export const INSIDE = {
  regular: { entry: 110, step: 54, tail: 40 },
  compact: { entry: 90, step: 44, tail: 30 },
  hold: 0.4,
  // Доли участка entry — стык с «Холодом». Событий много, поэтому стык
  // длиннее прежних, а события идут друг за другом: рассвет и смена банки,
  // потом стекло, потом первая капсула
  handoff: {
    // Ночь рассеивается: фон возвращается к светлому ледяному
    dawn: [0.04, 0.56],
    // Иней тает: банка снова «только из холодильника», как на первом экране
    thaw: [0.04, 0.5],
    // Синяя банка улетает, Ultra White возвращается из глубины
    swap: [0.08, 0.64],
    // Банка переезжает в слот главы
    stage: [0.1, 0.7],
    // Лёд расходится за края кадра, капли в воздухе исчезают — сцена
    // освобождается под капсулы и метки
    clear: [0.08, 0.56],
    // Банка становится стеклянной
    glass: [0.56, 0.84],
    // Плашка и метки проявляются
    ui: [0.56, 0.96],
    // Первая капсула поднимается из банки — к первой остановке она на месте
    first: [0.72, 1],
    // Шапка возвращается на тёмный текст, когда фон под ней уже светлый
    theme: 0.36,
    // После этой доли глава считается текущей (для меню)
    nav: 0.5,
  },
  // Доли последнего перехода (к итоговой остановке): капсулы возвращаются
  // в банку по одной с конца, каждая — за span, следующая — через stagger;
  // метки гаснут сразу, стекло снова становится печатью под конец
  seal: {
    stagger: 0.13,
    span: 0.42,
    tags: [0, 0.3],
    glass: [0.62, 1],
  },
} as const

export type InsideState = ChapterState

export function insideDistance(layout: ChapterLayout, count: number): number {
  return chapterDistance(INSIDE[layout], count)
}

export function insideState(
  progress: number,
  layout: ChapterLayout,
  count: number,
  out: InsideState = { enter: 0, position: 0, raw: 0 },
): InsideState {
  return chapterState(progress, INSIDE[layout], count, INSIDE.hold, out)
}

// Остановка index в центре своей паузы — туда ведут метки ингредиентов
export function insideProgressFor(index: number, layout: ChapterLayout, count: number): number {
  return chapterProgressFor(index, INSIDE[layout], count)
}

// --- Финальный экран ----------------------------------------------------------------
//
// Та же механика глав, две остановки: «замёрзло» — экран затянут инеем, его
// можно протереть курсором или пальцем, — и «открыто» — иней разбит, вокруг
// банки панели магазинов и рассылки. Если иней не разбили раньше, он
// разбивается сам на переходе между остановками (autoBreak). Сам момент
// разбития — событие, а не скролл: удар когтя и осколки идут по времени
// (state/frost.ts), а скролл только запускает их.
//
//   стык ── иней ── переход (иней разбивается) ── открыто ── хвост
export const FINAL_STOPS = 2

export const FINAL = {
  regular: { entry: 100, step: 70, tail: 35 },
  compact: { entry: 85, step: 55, tail: 30 },
  hold: 0.4,
  // Доли участка entry — стык с «Составом»: сначала банка и лёд, потом иней
  handoff: {
    // Банка переезжает из слота «Состава» в центр
    stage: [0.05, 0.6],
    // Лёд возвращается из-за краёв кадра, капли снова в воздухе
    ice: [0.08, 0.62],
    // Подсветка и сияние за банкой — снова как у Ultra White в коллекции
    look: [0.05, 0.6],
    // Иней затягивает экран от краёв к центру
    frost: [0.42, 0.98],
    // Заголовок и подсказка проявляются, когда иней почти сомкнулся
    ui: [0.7, 0.95],
    // С этой доли иней можно протирать (курсор становится «скребком»)
    wipe: 0.8,
    // После этой доли глава считается текущей (для меню)
    nav: 0.5,
  },
  // Положение без остановок (raw), после которого иней разбивается сам
  autoBreak: 0.4,
  // «Уменьшить движение»: иней не разбивается, а тает по скроллу на этом участке raw
  melt: [0.06, 0.38],
} as const

export type FinalState = ChapterState

export function finalDistance(layout: ChapterLayout): number {
  return chapterDistance(FINAL[layout], FINAL_STOPS)
}

export function finalState(progress: number, layout: ChapterLayout, out: FinalState = { enter: 0, position: 0, raw: 0 }): FinalState {
  return chapterState(progress, FINAL[layout], FINAL_STOPS, FINAL.hold, out)
}

// Остановка index в центре своей паузы: 0 — иней, 1 — открытый экран
// (туда ведут кнопки шапки «Find a store» и «Join the pack»)
export function finalProgressFor(index: number, layout: ChapterLayout): number {
  return chapterProgressFor(index, FINAL[layout], FINAL_STOPS)
}

// Насколько капсула index «снаружи»: 0 — в банке, 1 — у своей метки.
// enter — стык главы (первая капсула выходит на нём), position — положение в
// главе с остановками, count — число капсул (итоговая остановка — следующая
// после них). Одна функция для 3D (полёт капсулы) и DOM (состояние метки)
export function capsuleOut(index: number, enter: number, position: number, count: number): number {
  const [firstFrom, firstTo] = INSIDE.handoff.first
  const rise = index === 0 ? smoothstep(enter, firstFrom, firstTo) : Math.min(1, Math.max(0, position - (index - 1)))
  // Возврат: последняя капсула уходит в банку первой — стопка в банке
  // складывается в исходном порядке
  const seal = Math.min(1, Math.max(0, position - (count - 1)))
  const from = (count - 1 - index) * INSIDE.seal.stagger
  return rise * (1 - smoothstep(seal, from, from + INSIDE.seal.span))
}
