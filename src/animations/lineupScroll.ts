import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { FLAVORS } from '@/content/flavors'
import { motion } from '@/state/motion'
import { setActiveSection } from '@/state/navigation'
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
//  - на стыке с первым экраном проявляет плашку и шкалу.
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

// Где глава начинается и сколько длится, px прокрутки. Начало — там, где
// кончается сцена Hero (её ScrollTrigger 'bottom bottom' считает по высоте
// окна), а не там, где прилипает sticky-экран главы (он 100svh). На
// десктопе это одно и то же. На телефоне со спрятанной адресной строкой окно
// выше 100svh — без этой поправки между главами была бы "мёртвая" полоса
// скролла, где не меняется ничего, а остановки на банках сжимались бы.
export function lineupScrollRange(section: HTMLElement, viewport: HTMLElement) {
  const top = section.getBoundingClientRect().top + window.scrollY
  return {
    start: top + viewport.offsetHeight - window.innerHeight,
    distance: section.offsetHeight - viewport.offsetHeight,
  }
}

// Позиция прокрутки (px от верха документа) для доли пути главы в svh
function scrollTopAt(section: HTMLElement, viewport: HTMLElement, scrolledSvh: number, layout: LineupLayout): number {
  const range = lineupScrollRange(section, viewport)
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
  // или смены размера окна остаться на той же банке (длина главы в
  // пикселях при этом меняется, и та же прокрутка значила бы другую банку)
  const last: LineupState & { progress: number } = { progress: 0, enter: 0, position: 0, raw: 0 }
  let restore: { enter: number; raw: number } | null = null

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
        start: () => lineupScrollRange(section, viewport).start,
        end: () => {
          const range = lineupScrollRange(section, viewport)
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

  // Пересчёт позиций (поворот, смена размера окна, смена раскладки): перед
  // ним запоминаем, где были в главе, после — возвращаемся туда же
  const onRefreshInit = () => {
    restore = last.progress > 0 && last.progress < 1 ? { enter: last.enter, raw: last.raw } : null
  }
  const onRefresh = () => {
    if (!restore) return
    const layout = motion.lineupLayout
    const { entry, step } = LINEUP[layout]
    const scrolled = restore.enter < 1 ? restore.enter * entry : entry + step * restore.raw
    restore = null
    const target = scrollTopAt(section, viewport, scrolled, layout)
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
  }
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit)
  ScrollTrigger.addEventListener('refresh', onRefresh)

  return () => {
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit)
    ScrollTrigger.removeEventListener('refresh', onRefresh)
    media.revert()
    motion.lineup = 0
    setActiveSection('top')
  }
}
