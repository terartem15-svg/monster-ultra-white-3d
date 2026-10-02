import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { FLAVORS } from '@/content/flavors'
import { motion } from '@/state/motion'
import { setActiveSection } from '@/state/navigation'
import { chapterScrollRange } from './chapterRange'
import { keepChapterPosition } from './chapterRestore'
import {
  LINEUP,
  LINEUP_BREAKPOINTS,
  lineupDistance,
  lineupProgressFor,
  lineupState,
  type LineupLayout,
  type LineupState,
} from './scrollPhases'

gsap.registerPlugin(ScrollTrigger)

// Скролл-сцена главы «Коллекция». Пока sticky-экран держится на месте,
// прогресс секции 0..1:
//  - пишется в motion.lineup — по нему 3D-сцена меняет банки, цвет фона,
//    слово за банкой и подсветку (three/lineup/*, three/Backdrop.tsx);
//  - ведёт шкалу прогресса: кольцо и заливка едут непрерывно, за скроллом;
//  - сообщает, какой вкус сейчас в центре (плашка меняет текст на середине
//    перехода) и что в меню пора подсветить Lineup;
//  - на стыке с первым экраном проявляет плашку и шкалу, на стыке с
//    главой «Холод» — гасит их.
//
// Секция начинается на экран раньше конца первого экрана (margin-top: -100svh
// в CSS): её sticky-экран "прилипает" ровно тогда, когда сцена Hero дошла до
// финала, и банка из финала без паузы становится первой в коллекции.

const COUNT = FLAVORS.length

export interface LineupRailNodes {
  // Обёртка кольца: её ширина — путь от первой отметки до последней
  travel: HTMLElement
  fill: HTMLElement
}

interface LineupScrollOptions {
  // Sticky-экран главы: его высота (100svh в пикселях) задаёт начало главы
  viewport: HTMLElement
  rail: LineupRailNodes
  onActiveChange: (index: number) => void
}

// Раскладка главы — по той же границе, что и в CSS (Lineup.module.css)
const COMPACT_QUERY = `(max-width: ${LINEUP_BREAKPOINTS.compact - 1}px)`

// Позиция прокрутки (px от верха документа) для доли пути главы в svh.
// Начало главы — где кончается сцена Hero (animations/chapterRange.ts)
function scrollTopAt(section: HTMLElement, viewport: HTMLElement, scrolledSvh: number, layout: LineupLayout): number {
  const range = chapterScrollRange(section, viewport)
  return range.start + (scrolledSvh / lineupDistance(layout, COUNT)) * range.distance
}

// Позиция прокрутки, на которой банка index стоит в центре своей остановки —
// туда ведут шкала прогресса и пункт меню Lineup
export function lineupScrollTop(section: HTMLElement, viewport: HTMLElement, index: number): number {
  const layout = motion.lineupLayout
  return scrollTopAt(section, viewport, lineupProgressFor(index, layout, COUNT) * lineupDistance(layout, COUNT), layout)
}

export function createLineupScroll(section: HTMLElement, options: LineupScrollOptions): () => void {
  const { viewport } = options
  const media = gsap.matchMedia()
  const ui = Array.from(section.querySelectorAll<HTMLElement>('[data-lineup-ui]'))
  let activeIndex = -1
  // Последнее известное положение в главе — чтобы после поворота телефона
  // или смены размера окна остаться на той же банке (chapterRestore.ts)
  const last: LineupState & { progress: number } = { progress: 0, enter: 0, position: 0, raw: 0 }

  media.add({ compact: COMPACT_QUERY, regular: `not all and ${COMPACT_QUERY}`, reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
    const layout: LineupLayout = context.conditions?.compact ? 'compact' : 'regular'
    const reduce = Boolean(context.conditions?.reduce)
    motion.lineupLayout = layout

    const total = lineupDistance(layout, COUNT)
    const entry = LINEUP[layout].entry / total
    const [uiFrom, uiTo] = LINEUP.handoff.ui

    const onUpdate = (self: ScrollTrigger) => {
      motion.lineup = self.progress
      const state = lineupState(self.progress, layout, COUNT, last)
      last.progress = self.progress

      // Шкала: кольцо и заливка — за положением в коллекции, без сглаживания
      const t = COUNT > 1 ? state.position / (COUNT - 1) : 0
      options.rail.travel.style.transform = `translateX(${t * 100}%)`
      options.rail.fill.style.transform = `scaleX(${t})`

      const index = Math.round(state.position)
      if (index !== activeIndex) {
        activeIndex = index
        options.onActiveChange(index)
      }
      setActiveSection(state.enter > LINEUP.handoff.nav ? 'lineup' : 'top')
    }

    // Таймлайн нормирован на 1, как у первого экрана: позиции — доли скролла
    // секции. Плашка и шкала выплывают снизу; при "уменьшить движение" —
    // только проявляются.
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
    timeline
      .fromTo(
        ui,
        { autoAlpha: 0, y: reduce ? 0 : 28 },
        { autoAlpha: 1, y: 0, duration: entry * (uiTo - uiFrom), ease: 'power2.out', stagger: entry * 0.08 },
        entry * uiFrom,
      )
      .set({}, {}, 1)
  })

  // Пересчёт позиций (поворот, смена размера окна, смена раскладки):
  // возвращаемся на то же место главы уже в новой раскладке
  const stopKeeping = keepChapterPosition(last, ({ enter, raw }) => {
    const layout = motion.lineupLayout
    const { entry, step } = LINEUP[layout]
    const target = scrollTopAt(section, viewport, enter < 1 ? enter * entry : entry + step * raw, layout)
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
  })

  // Стык со следующей главой («Холод»): когда экран коллекции отлипает и
  // уезжает вверх, плашка и шкала гаснут за первую треть экрана — фон под
  // ними уже темнеет. Анимируются внутренние обёртки: внешние (data-lineup-ui)
  // проявляет таймлайн главы, и две анимации не спорят за прозрачность.
  // Отдельный триггер: он живёт уже после конца скролл-сцены коллекции
  const exit = gsap.fromTo(
    Array.from(section.querySelectorAll<HTMLElement>('[data-lineup-exit]')),
    { autoAlpha: 1 },
    {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'bottom bottom', end: 'bottom 70%', scrub: true },
    },
  )

  return () => {
    stopKeeping()
    exit.scrollTrigger?.kill()
    exit.kill()
    media.revert()
    motion.lineup = 0
    setActiveSection('top')
  }
}
