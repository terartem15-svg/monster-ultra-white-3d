import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { INGREDIENTS, INSIDE_STOPS } from '@/content/inside'
import { motion } from '@/state/motion'
import { setActiveSection } from '@/state/navigation'
import { setDawn } from '@/state/theme'
import { smoothstep } from '@/utils/smoothstep'
import { chapterScrollRange } from './chapterRange'
import { keepChapterPosition } from './chapterRestore'
import {
  INSIDE,
  LINEUP_BREAKPOINTS,
  insideDistance,
  insideProgressFor,
  insideState,
  type ChapterLayout,
  type InsideState,
} from './scrollPhases'

gsap.registerPlugin(ScrollTrigger)

// Скролл-сцена главы «Состав». Пока sticky-экран держится на месте,
// прогресс секции 0..1:
//  - пишется в motion.inside — по нему 3D-сцена рассеивает ночь, меняет
//    банку на Ultra White, делает её стеклянной и ведёт капсулы: из банки к
//    меткам и обратно (three/inside/*, three/can/glass.ts);
//  - сообщает, какая остановка сейчас текущая (плашка меняет текст на
//    середине перехода), какую главу считать текущей и когда шапке пора
//    обратно на тёмный текст;
//  - на стыке с «Холодом» проявляет плашку и метки, а на последнем переходе,
//    когда капсулы возвращаются в банку, гасит метки; плашку с полным
//    списком гасит уже стык с финальным экраном.
//
// Секция, как и прошлые главы, начинается на экран раньше конца предыдущей
// (margin-top: -100svh): её sticky-экран прилипает ровно тогда, когда «Холод»
// дошёл до последней остановки.

const COUNT = INSIDE_STOPS
// Остановка, с которой начинается возврат капсул (последний ингредиент)
const LAST_INGREDIENT = INGREDIENTS.length - 1

interface InsideScrollOptions {
  viewport: HTMLElement
  // Обёртка меток: гаснет, когда капсулы возвращаются в банку
  tags: HTMLElement
  onActiveChange: (index: number) => void
}

// Раскладка — по той же границе, что и у прошлых глав (и в CSS)
const COMPACT_QUERY = `(max-width: ${LINEUP_BREAKPOINTS.compact - 1}px)`

// Позиция прокрутки (px от верха документа) для пути главы в svh
function scrollTopAt(section: HTMLElement, viewport: HTMLElement, scrolledSvh: number, layout: ChapterLayout): number {
  const range = chapterScrollRange(section, viewport)
  return range.start + (scrolledSvh / insideDistance(layout, COUNT)) * range.distance
}

// Остановка index в центре своей паузы — туда ведут метки ингредиентов
export function insideScrollTop(section: HTMLElement, viewport: HTMLElement, index: number): number {
  const layout = motion.insideLayout
  return scrollTopAt(section, viewport, insideProgressFor(index, layout, COUNT) * insideDistance(layout, COUNT), layout)
}

export function createInsideScroll(section: HTMLElement, options: InsideScrollOptions): () => void {
  const { viewport, tags } = options
  const media = gsap.matchMedia()
  // Плашка выплывает снизу; метки только проявляются: рядом с ними стоят
  // капсулы, и место меток на экране меряется (hooks/useDockTracking.ts) —
  // сдвигать их нельзя
  const rising = Array.from(section.querySelectorAll<HTMLElement>('[data-inside-ui="rise"]'))
  const fading = Array.from(section.querySelectorAll<HTMLElement>('[data-inside-ui="fade"]'))
  let activeIndex = -1
  let tagsShown = Number.NaN
  // Последнее известное положение — чтобы после поворота телефона или смены
  // размера окна остаться на том же ингредиенте (chapterRestore.ts)
  const last: InsideState & { progress: number } = { progress: 0, enter: 0, position: 0, raw: 0 }

  media.add({ compact: COMPACT_QUERY, regular: `not all and ${COMPACT_QUERY}`, reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
    const layout: ChapterLayout = context.conditions?.compact ? 'compact' : 'regular'
    const reduce = Boolean(context.conditions?.reduce)
    motion.insideLayout = layout

    const total = insideDistance(layout, COUNT)
    const entry = INSIDE[layout].entry / total
    const [uiFrom, uiTo] = INSIDE.handoff.ui
    const [tagsFrom, tagsTo] = INSIDE.seal.tags

    const onUpdate = (self: ScrollTrigger) => {
      motion.inside = self.progress
      const state = insideState(self.progress, layout, COUNT, last)
      last.progress = self.progress

      // Метки гаснут в начале последнего перехода: капсулы уходят в банку, и
      // показывать меткам больше не на что. Скрытые метки не ловят фокус.
      // Видимость только отнимается: вернуть её — значит убрать своё
      // значение, иначе метки «проступили» бы сквозь скрытую внешнюю обёртку
      const seal = Math.min(1, Math.max(0, state.position - LAST_INGREDIENT))
      const shown = Math.round((1 - smoothstep(seal, tagsFrom, tagsTo)) * 100) / 100
      if (shown !== tagsShown) {
        tagsShown = shown
        tags.style.opacity = `${shown}`
        tags.style.visibility = shown > 0 ? '' : 'hidden'
      }

      const index = Math.round(state.position)
      if (index !== activeIndex) {
        activeIndex = index
        options.onActiveChange(index)
      }
      // Выше главы (прогресс 0) меню не трогаем — там командуют свои главы
      if (self.progress > 0) setActiveSection(state.enter > INSIDE.handoff.nav ? 'inside' : 'cold')
      // Рассвет для шапки и курсора: фон под ними снова светлый
      setDawn(state.enter > INSIDE.handoff.theme)
    }

    // Таймлайн нормирован на 1: позиции — доли скролла секции
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
      .fromTo(rising, { autoAlpha: 0, y: reduce ? 0 : 28 }, { autoAlpha: 1, y: 0, duration, ease: 'power2.out' }, entry * uiFrom)
      .fromTo(fading, { autoAlpha: 0 }, { autoAlpha: 1, duration, ease: 'power2.out' }, entry * (uiFrom + 0.08))
      .set({}, {}, 1)
  })

  // Пересчёт позиций (поворот, смена размера окна, смена раскладки):
  // возвращаемся на тот же ингредиент уже в новой раскладке
  const stopKeeping = keepChapterPosition(last, ({ enter, raw }) => {
    const layout = motion.insideLayout
    const { entry, step } = INSIDE[layout]
    const target = scrollTopAt(section, viewport, enter < 1 ? enter * entry : entry + step * raw, layout)
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
  })

  // Стык с финальным экраном: когда экран «Состава» отлипает и уезжает
  // вверх, плашка гаснет за первую треть экрана — банка уходит к центру, и
  // экран начинает затягивать иней. Как у прошлых глав, анимируется
  // внутренняя обёртка: внешнюю проявляет таймлайн главы
  const exit = gsap.fromTo(
    Array.from(section.querySelectorAll<HTMLElement>('[data-inside-exit]')),
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
    motion.inside = 0
    setDawn(false)
    tags.style.opacity = ''
    tags.style.visibility = ''
  }
}
