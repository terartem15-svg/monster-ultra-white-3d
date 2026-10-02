import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Возврат на то же место главы после поворота телефона или смены размера
// окна. Длина главы в пикселях при этом меняется, и та же прокрутка значила
// бы другую банку (другую температуру), поэтому глава запоминает, где была
// (положение в своих единицах — стык и номер остановки), и после пересчёта
// ScrollTrigger прокручивает туда же. Общее для всех глав с остановками.
//
// Запоминать нужно до того, как изменится разметка. Когда окно уменьшается,
// страница становится короче, браузер сразу поджимает прокрутку и шлёт
// scroll — и ScrollTrigger успевает обновить главу по старым меркам (его
// пересчёт отложен на доли секунды) и испортить «последнее положение». Так
// глава в конце страницы после поворота уезжала на стык. Поэтому снимок
// делается прямо в событии resize: по спецификации оно приходит раньше
// scroll того же кадра.

export interface ChapterSnapshot {
  // Прогресс секции 0..1; на краях (0 и 1) возвращать некуда — глава не на экране
  progress: number
  enter: number
  raw: number
}

// Серия resize (поворот телефона) — одна «перестройка»: снимок берётся по
// первому событию серии и живёт, пока события идут, и ещё BURST_TTL после
// последнего: после смены размера ScrollTrigger пересчитывает позиции не
// один раз, и все пересчёты серии возвращают на снимок. Если за серией не
// последовал пересчёт (телефон проигнорировал изменение одной высоты при
// скрытии адресной строки — ScrollTrigger так делает на сенсорных
// экранах), снимок устаревает: следующему пересчёту нужен свежий «последний».
//
// Вторая ловушка — внутри самого пересчёта. В конце он прогоняет все главы
// через прежнюю прокрутку уже в новой раскладке (и только потом мы
// возвращаем страницу на место): эта прокрутка попадает в другую главу, та
// запоминает её как своё «последнее» и на следующем пересчёте утащила бы
// страницу к себе (так было при увеличении окна: телефон лёжа → десктоп).
// Поэтому «последнее» на время пересчёта откладывается и после него
// возвращается: верное положение глава узнает из прокрутки после возврата
const BURST_TTL = 1000

// last — изменяемое положение главы, которое обновляет её onUpdate;
// scrollBack — прокрутить к положению (в новой раскладке)
export function keepChapterPosition(
  last: ChapterSnapshot,
  scrollBack: (position: { enter: number; raw: number }) => void,
): () => void {
  let snapshot: ChapterSnapshot | null = null
  let lastResize = Number.NEGATIVE_INFINITY
  let restore: { enter: number; raw: number } | null = null
  // «Последнее» до пересчёта — его портит прогон глав внутри пересчёта
  let held: ChapterSnapshot | null = null

  // После первого события серии положение уже могло испортиться — снимок
  // только по первому
  const onResize = () => {
    const now = performance.now()
    if (!snapshot || now - lastResize > BURST_TTL) {
      snapshot = { progress: last.progress, enter: last.enter, raw: last.raw }
    }
    lastResize = now
  }

  const onRefreshInit = () => {
    const fresh = snapshot && performance.now() - lastResize < BURST_TTL ? snapshot : null
    if (!fresh) snapshot = null
    const source = fresh ?? last
    restore = source.progress > 0 && source.progress < 1 ? { enter: source.enter, raw: source.raw } : null
    held = { progress: last.progress, enter: last.enter, raw: last.raw }
  }

  const onRefresh = () => {
    if (held) {
      last.progress = held.progress
      last.enter = held.enter
      last.raw = held.raw
      held = null
    }
    if (!restore) return
    const position = restore
    restore = null
    scrollBack(position)
  }

  window.addEventListener('resize', onResize)
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit)
  ScrollTrigger.addEventListener('refresh', onRefresh)
  return () => {
    window.removeEventListener('resize', onResize)
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit)
    ScrollTrigger.removeEventListener('refresh', onRefresh)
  }
}
