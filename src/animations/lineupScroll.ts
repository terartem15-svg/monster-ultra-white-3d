import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { FLAVORS } from '@/content/flavors'
import { motion } from '@/state/motion'
import { setActiveSection } from '@/state/navigation'
import { LINEUP, lineupDistance, lineupProgressFor, lineupState, type LineupLayout } from './scrollPhases'

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
  rail: LineupRailNodes
  onActiveChange: (index: number) => void
}

// Раскладка главы — по той же границе, что и в CSS (Lineup.module.css)
const COMPACT_QUERY = '(max-width: 699px)'

export function createLineupScroll(section: HTMLElement, options: LineupScrollOptions): () => void {
  const media = gsap.matchMedia()
  const ui = Array.from(section.querySelectorAll<HTMLElement>('[data-lineup-ui]'))
  let activeIndex = -1

  media.add({ compact: COMPACT_QUERY, regular: `not all and ${COMPACT_QUERY}`, reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
    const layout: LineupLayout = context.conditions?.compact ? 'compact' : 'regular'
    const reduce = Boolean(context.conditions?.reduce)
    motion.lineupLayout = layout

    const total = lineupDistance(layout, COUNT)
    const entry = LINEUP[layout].entry / total
    const [uiFrom, uiTo] = LINEUP.handoff.ui

    const onUpdate = (self: ScrollTrigger) => {
      motion.lineup = self.progress
      const state = lineupState(self.progress, layout, COUNT)

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
      scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: true, onUpdate },
    })
    timeline
      .fromTo(
        ui,
        { autoAlpha: 0, y: reduce ? 0 : 28 },
        { autoAlpha: 1, y: 0, duration: entry * (uiTo - uiFrom), ease: 'power2.out', stagger: entry * 0.08 },
        entry * uiFrom,
      )
      .set({}, {}, 1)

    return () => {
      motion.lineup = 0
    }
  })

  return () => {
    media.revert()
    motion.lineup = 0
    setActiveSection('top')
  }
}

// Позиция прокрутки (px от верха документа), на которой банка index стоит в
// центре своей остановки. Секция скроллится на свою высоту минус экран —
// ровно так же считает ScrollTrigger (start 'top top', end 'bottom bottom').
export function lineupScrollTop(section: HTMLElement, index: number): number {
  const top = section.getBoundingClientRect().top + window.scrollY
  const distance = section.offsetHeight - window.innerHeight
  return top + lineupProgressFor(index, motion.lineupLayout, COUNT) * distance
}
