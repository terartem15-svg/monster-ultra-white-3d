import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { breakFrost, resetFrost, setFrostWipeable } from '@/state/frost'
import { motion } from '@/state/motion'
import { setActiveSection } from '@/state/navigation'
import { chapterScrollRange } from './chapterRange'
import { keepChapterPosition } from './chapterRestore'
import {
  FINAL,
  LINEUP_BREAKPOINTS,
  finalDistance,
  finalProgressFor,
  finalState,
  type ChapterLayout,
  type FinalState,
} from './scrollPhases'

gsap.registerPlugin(ScrollTrigger)

// Скролл-сцена финального экрана. Пока sticky-экран держится на месте,
// прогресс секции 0..1:
//  - пишется в motion.final — по нему 3D-сцена ведёт банку в центр,
//    возвращает лёд и затягивает экран инеем (three/final/*);
//  - решает судьбу инея: когда он сомкнулся — его можно протирать (курсор
//    становится скребком); проскроллили дальше — разбивается сам (при
//    «уменьшить движение» — тает); ушли выше стыка — иней вернётся при
//    следующем заходе (state/frost.ts);
//  - на стыке с «Составом» проявляет заголовок и подсказку.
//
// Секция, как и прошлые главы, начинается на экран раньше конца предыдущей
// (margin-top: -100svh): её sticky-экран прилипает ровно тогда, когда
// «Состав» дошёл до итоговой остановки.

interface FinalScrollOptions {
  viewport: HTMLElement
}

// Раскладка — по той же границе, что и у прошлых глав (и в CSS)
const COMPACT_QUERY = `(max-width: ${LINEUP_BREAKPOINTS.compact - 1}px)`

// Позиция прокрутки (px от верха документа) для пути главы в svh
function scrollTopAt(section: HTMLElement, viewport: HTMLElement, scrolledSvh: number, layout: ChapterLayout): number {
  const range = chapterScrollRange(section, viewport)
  return range.start + (scrolledSvh / finalDistance(layout)) * range.distance
}

// Остановка index в центре своей паузы: 0 — иней, 1 — открытый экран
export function finalScrollTop(section: HTMLElement, viewport: HTMLElement, index: number): number {
  const layout = motion.finalLayout
  return scrollTopAt(section, viewport, finalProgressFor(index, layout) * finalDistance(layout), layout)
}

export function createFinalScroll(section: HTMLElement, options: FinalScrollOptions): () => void {
  const { viewport } = options
  const media = gsap.matchMedia()
  // Заголовок и подсказка проявляются друг за другом; обёртки панелей — сразу
  // (сами панели всё равно скрыты, пока иней не разбит)
  const lead = Array.from(section.querySelectorAll<HTMLElement>('[data-final-ui="lead"]'))
  const panels = Array.from(section.querySelectorAll<HTMLElement>('[data-final-ui="panel"]'))
  // Последнее известное положение — чтобы после поворота телефона или смены
  // размера окна остаться на том же месте главы (chapterRestore.ts)
  const last: FinalState & { progress: number } = { progress: 0, enter: 0, position: 0, raw: 0 }
  // Идёт ли пересчёт ScrollTrigger: от refreshInit до refresh главы
  // прогоняются через прежнюю прокрутку в новой раскладке (chapterRestore.ts)
  let refreshing = false
  const onRefreshInit = () => {
    refreshing = true
  }
  const onRefresh = () => {
    refreshing = false
  }
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit)
  ScrollTrigger.addEventListener('refresh', onRefresh)

  media.add({ compact: COMPACT_QUERY, regular: `not all and ${COMPACT_QUERY}`, reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
    const layout: ChapterLayout = context.conditions?.compact ? 'compact' : 'regular'
    const reduce = Boolean(context.conditions?.reduce)
    motion.finalLayout = layout

    const entry = FINAL[layout].entry / finalDistance(layout)
    const [uiFrom, uiTo] = FINAL.handoff.ui
    const [frostFrom] = FINAL.handoff.frost

    const onUpdate = (self: ScrollTrigger) => {
      motion.final = self.progress
      const state = finalState(self.progress, layout, last)
      last.progress = self.progress

      // Иней: ещё не начал расти — возвращаем стекло к целому; сомкнулся —
      // можно протирать; проскроллили за середину перехода — разбивается сам.
      // Не во время пересчёта ScrollTrigger: в его конце главы прогоняются
      // через прежнюю прокрутку в новой раскладке, и после поворота телефона
      // разбитое стекло снова бы замёрзло. Верное положение придёт со
      // скроллом возврата на место
      if (!refreshing) {
        if (state.enter < frostFrom) resetFrost()
        else if (state.raw > FINAL.autoBreak) breakFrost(reduce ? 'melt' : 'shatter')
        setFrostWipeable(state.enter > FINAL.handoff.wipe)
      }

      // Выше главы (прогресс 0) меню не трогаем — там командуют свои главы
      if (self.progress > 0) setActiveSection(state.enter > FINAL.handoff.nav ? 'final' : 'inside')
    }

    // Таймлайн нормирован на 1: позиции — доли скролла секции. Заголовок и
    // подсказка выплывают снизу; при "уменьшить движение" — только проявляются
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: () => chapterScrollRange(section, viewport).start,
        end: () => {
          const range = chapterScrollRange(section, viewport)
          return range.start + range.distance
        },
        scrub: true,
        onUpdate,
      },
    })
    const duration = entry * (uiTo - uiFrom)
    timeline
      .fromTo(
        lead,
        { autoAlpha: 0, y: reduce ? 0 : 24 },
        { autoAlpha: 1, y: 0, duration, ease: 'power2.out', stagger: entry * 0.05 },
        entry * uiFrom,
      )
      .fromTo(panels, { autoAlpha: 0 }, { autoAlpha: 1, duration, ease: 'power2.out' }, entry * uiFrom)
      .set({}, {}, 1)
  })

  // Пересчёт позиций (поворот, смена размера окна, смена раскладки):
  // возвращаемся на то же место главы уже в новой раскладке
  const stopKeeping = keepChapterPosition(last, ({ enter, raw }) => {
    const layout = motion.finalLayout
    const { entry, step } = FINAL[layout]
    const target = scrollTopAt(section, viewport, enter < 1 ? enter * entry : entry + step * raw, layout)
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
  })

  return () => {
    stopKeeping()
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit)
    ScrollTrigger.removeEventListener('refresh', onRefresh)
    media.revert()
    motion.final = 0
    setFrostWipeable(false)
  }
}
