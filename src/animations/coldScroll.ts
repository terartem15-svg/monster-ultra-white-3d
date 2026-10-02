import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { COLD_SCALE, COLD_STOPS, COLD_TEMPERATURES, coldStateAt, type ColdStateId } from '@/content/cold'
import { motion } from '@/state/motion'
import { setActiveSection } from '@/state/navigation'
import { setNight } from '@/state/theme'
import { smoothstep } from '@/utils/smoothstep'
import { chapterScrollRange } from './chapterRange'
import { keepChapterPosition } from './chapterRestore'
import {
  COLD,
  LINEUP_BREAKPOINTS,
  coldDistance,
  coldProgressFor,
  coldState,
  coldTemperature,
  type ChapterLayout,
  type ColdState,
} from './scrollPhases'

gsap.registerPlugin(ScrollTrigger)

// Скролл-сцена главы «Холод». Пока sticky-экран держится на месте,
// прогресс секции 0..1:
//  - пишется в motion.cold — по нему 3D-сцена темнит фон, сушит банку на
//    стыке и остужает её дальше: капли, дорожки, иней (three/can/cold/*);
//  - крутит колёса табло (цифры температуры) и ведёт шкалу: кольцо и след
//    едут строго за скроллом;
//  - сообщает, какая остановка сейчас текущая (текст меняется на середине
//    перехода), в каком состоянии поверхность банки (сухо, конденсат…), какую
//    главу подсветить в меню и когда шапке пора на светлый текст;
//  - на стыке с коллекцией проявляет табло, текст и шкалу, на стыке с главой
//    «Состав» — гасит их.
//
// Секция, как и коллекция, начинается на экран раньше конца предыдущей
// главы (margin-top: -100svh): её sticky-экран прилипает ровно тогда, когда
// коллекция дошла до последней банки, и та же банка (Ultra Baltic) без
// паузы становится банкой этой главы.

const COUNT = COLD_STOPS.length
const RANGE = COLD_SCALE.top - COLD_SCALE.bottom

export interface ColdTrackNodes {
  // Путь кольца: его ширина — вся шкала, translateX ставит кольцо на градус
  travel: HTMLElement
  // След от тёплого края шкалы до кольца
  fill: HTMLElement
}

interface ColdScrollOptions {
  viewport: HTMLElement
  // Корень табло (components/ColdReadout): колёса цифр — по data-readout
  readout: HTMLElement
  track: ColdTrackNodes
  onActiveChange: (index: number) => void
  onSurfaceChange: (state: ColdStateId) => void
}

// --- Табло: колёса счётчика ---------------------------------------------------------

interface ReadoutNodes {
  value: HTMLElement
  lead: HTMLElement
  tensWheel: HTMLElement
  tens: HTMLElement
  ones: HTMLElement
  minus: HTMLElement
  // Ширина цифры и минуса, px — старший разряд схлопывается до них и до нуля
  digit: number
  minusWidth: number
}

function findReadout(root: HTMLElement): ReadoutNodes | null {
  const find = (name: string) => root.querySelector<HTMLElement>(`[data-readout="${name}"]`)
  const value = find('value')
  const lead = find('lead')
  const tensWheel = find('tens-wheel')
  const tens = find('tens')
  const ones = find('ones')
  const minus = find('minus')
  if (!value || !lead || !tensWheel || !tens || !ones || !minus) return null
  return { value, lead, tensWheel, tens, ones, minus, digit: 0, minusWidth: 0 }
}

// Ширины зависят от размера шрифта (он растёт с окном) — перемеряются при resize
function measureReadout(nodes: ReadoutNodes) {
  nodes.digit = nodes.tensWheel.getBoundingClientRect().width
  nodes.minusWidth = nodes.minus.getBoundingClientRect().width
}

// Температура → положение колёс. Как у настоящего счётчика: единицы крутятся
// непрерывно, десятки — только на последнем градусе перед сменой. Ниже
// десяти старший разряд гаснет и схлопывается, ниже нуля на его месте —
// минус. В мороз табло покрывается инеем (--frost)
function writeReadout(nodes: ReadoutNodes, temperature: number) {
  const x = Math.abs(temperature)
  const ones = x % 10
  const tens = Math.floor(x / 10) + Math.max(0, ones - 9)
  const tensShown = temperature >= 0 ? smoothstep(x, 9, 10) : 0
  const minusShown = smoothstep(-temperature, 0, 0.6)
  nodes.ones.style.transform = `translateY(${-ones}em)`
  nodes.tens.style.transform = `translateY(${-tens}em)`
  nodes.tensWheel.style.opacity = `${tensShown}`
  nodes.minus.style.opacity = `${minusShown}`
  nodes.lead.style.width = `${Math.max(tensShown * nodes.digit, minusShown * nodes.minusWidth).toFixed(1)}px`
  nodes.value.style.setProperty('--frost', smoothstep(-temperature, 0, 4).toFixed(3))
}

// Раскладка — по той же границе, что и у коллекции (и в CSS)
const COMPACT_QUERY = `(max-width: ${LINEUP_BREAKPOINTS.compact - 1}px)`

// Позиция прокрутки (px от верха документа) для пути главы в svh
function scrollTopAt(section: HTMLElement, viewport: HTMLElement, scrolledSvh: number, layout: ChapterLayout): number {
  const range = chapterScrollRange(section, viewport)
  return range.start + (scrolledSvh / coldDistance(layout, COUNT)) * range.distance
}

// Остановка index в центре своей паузы — туда ведут отметки шкалы
export function coldScrollTop(section: HTMLElement, viewport: HTMLElement, index: number): number {
  const layout = motion.coldLayout
  return scrollTopAt(section, viewport, coldProgressFor(index, layout, COUNT) * coldDistance(layout, COUNT), layout)
}

export function createColdScroll(section: HTMLElement, options: ColdScrollOptions): () => void {
  const { viewport, track } = options
  const media = gsap.matchMedia()
  const ui = Array.from(section.querySelectorAll<HTMLElement>('[data-cold-ui]'))
  const readout = findReadout(options.readout)
  let activeIndex = -1
  let surface: ColdStateId | null = null
  let lastTemperature: number = COLD_TEMPERATURES[0]
  // Ширины цифр — после загрузки шрифтов и при каждом изменении размера
  const remeasure = () => {
    if (!readout) return
    measureReadout(readout)
    writeReadout(readout, lastTemperature)
  }
  remeasure()
  void document.fonts?.ready.then(remeasure)
  window.addEventListener('resize', remeasure)
  // Последнее известное положение — чтобы после поворота телефона или смены
  // размера окна остаться на той же температуре (chapterRestore.ts)
  const last: ColdState & { progress: number } = { progress: 0, enter: 0, position: 0, raw: 0 }

  media.add({ compact: COMPACT_QUERY, regular: `not all and ${COMPACT_QUERY}`, reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
    const layout: ChapterLayout = context.conditions?.compact ? 'compact' : 'regular'
    const reduce = Boolean(context.conditions?.reduce)
    motion.coldLayout = layout

    const total = coldDistance(layout, COUNT)
    const entry = COLD[layout].entry / total
    const [uiFrom, uiTo] = COLD.handoff.ui

    const onUpdate = (self: ScrollTrigger) => {
      motion.cold = self.progress
      const state = coldState(self.progress, layout, COUNT, last)
      last.progress = self.progress

      // Шкала: 0 — слева (самое тёплое), 1 — справа. Без сглаживания — за скроллом
      const temperature = coldTemperature(state.position, COLD_TEMPERATURES)
      const t = (COLD_SCALE.top - temperature) / RANGE
      track.travel.style.transform = `translateX(${t * 100}%)`
      track.fill.style.transform = `scaleX(${t})`
      lastTemperature = temperature
      if (readout) writeReadout(readout, temperature)
      const next = coldStateAt(temperature).id
      if (next !== surface) {
        surface = next
        options.onSurfaceChange(next)
      }

      const index = Math.round(state.position)
      if (index !== activeIndex) {
        activeIndex = index
        options.onActiveChange(index)
      }
      // Выше главы (прогресс 0) меню не трогаем — там командуют свои главы
      if (self.progress > 0) setActiveSection(state.enter > COLD.handoff.nav ? 'cold' : 'lineup')
      setNight(state.enter > COLD.handoff.theme)
    }

    // Таймлайн нормирован на 1: позиции — доли скролла секции. Шкала и
    // плашка выплывают снизу; при "уменьшить движение" — только проявляются
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
  // возвращаемся на ту же температуру уже в новой раскладке
  const stopKeeping = keepChapterPosition(last, ({ enter, raw }) => {
    const layout = motion.coldLayout
    const { entry, step } = COLD[layout]
    const target = scrollTopAt(section, viewport, enter < 1 ? enter * entry : entry + step * raw, layout)
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
  })

  // Стык со следующей главой («Состав»): когда экран «Холода» отлипает и
  // уезжает вверх, шкала и плашка гаснут за первую треть экрана — под ними
  // уже светает. Как у коллекции, анимируются внутренние обёртки: внешние
  // (data-cold-ui) проявляет таймлайн главы
  const exit = gsap.fromTo(
    Array.from(section.querySelectorAll<HTMLElement>('[data-cold-exit]')),
    { autoAlpha: 1 },
    {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'bottom bottom', end: 'bottom 70%', scrub: true },
    },
  )

  return () => {
    stopKeeping()
    window.removeEventListener('resize', remeasure)
    exit.scrollTrigger?.kill()
    exit.kill()
    media.revert()
    motion.cold = 0
    setNight(false)
  }
}
