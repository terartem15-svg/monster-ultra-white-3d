import type { FinalPanelId } from '@/content/final'
import type { SectionId } from '@/state/navigation'

// Тексты первого экрана — в одном месте, отдельно от вёрстки. Сайт на
// английском (по брифу); копирайт сухой и конкретный: что это за продукт и
// чем он отличается, без маркетинговой воды.

export interface NavLink {
  label: string
  href: string
  // Глава, к которой ведёт пункт: её видимость подсвечивает пункт в меню
  section?: SectionId
}

// Вкладка продуктов названа Lineup — линейка вкусов: коротко, понятно и
// читается в пилюле меню так же легко, как Home и About. About ведёт в
// футер — к блоку о том, что это за страница (sections/Footer)
export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '#top', section: 'top' },
  { label: 'Lineup', href: '#lineup', section: 'lineup' },
  { label: 'About', href: '#about', section: 'about' },
]

// Кнопки шапки ведут к демо-панелям финального экрана (content/final.ts):
// плавный скролл к нему, иней на стекле разбивается, фокус — в поле панели
export interface HeaderAction {
  label: string
  href: string
  panel: FinalPanelId
}

export const HEADER_ACTIONS: Record<'store' | 'join', HeaderAction> = {
  store: { label: 'Find a store', href: '#stores', panel: 'stores' },
  join: { label: 'Join the pack', href: '#join', panel: 'join' },
}

// Заголовок по строкам — каждая строка выезжает из своей маски при загрузке
export const HERO_TITLE_LINES = ['What', 'makes it', 'Ultra?']

// Позиция голубого свечения в карточке: свет "падает" со стороны банки
export type GlowCorner = 'right-bottom' | 'left-bottom' | 'right-top' | 'left-top'

export interface Feature {
  title: string
  text: string
  glow: GlowCorner
}

// Порядок — порядок чтения 01 → 04; на десктопе нечётные слева, чётные справа
export const FEATURES: Feature[] = [
  {
    title: 'Zero sugar.',
    text: 'All the Monster energy, none of the sugar, and next to no calories.',
    glow: 'right-bottom',
  },
  {
    title: 'Crisp citrus.',
    text: 'A light, clean citrus taste with a smooth, ice-cold finish.',
    glow: 'left-bottom',
  },
  {
    title: 'Energy blend.',
    text: 'Caffeine, taurine and B-vitamins, balanced to keep you sharp.',
    glow: 'right-top',
  },
  {
    title: 'Served cold.',
    // Неразрывный пробел между числом и единицей: «2 °C» не разрывается строкой
    text: 'Best straight from the fridge at 2\u00a0°C. Crack it and feel the frost.',
    glow: 'left-top',
  },
]

export const SCROLL_CUE = 'Scroll to assemble'

// Выноски сцены деталей: камера подлетает к собранной банке, и к её частям
// тянутся подписи. Порядок совпадает с точками в three/calloutAnchors.ts.
export interface Callout {
  title: string
  text: string
}

export const CALLOUTS: Callout[] = [
  { title: 'Stay-on tab', text: 'Recyclable aluminium, sealed cold' },
  { title: 'Zero sugar', text: 'The full Monster kick, 10 calories' },
  { title: 'Served ice-cold', text: 'Best at 2 °C, beaded with frost' },
  { title: 'Taurine + ginseng', text: 'The energy blend, with B-vitamins' },
]

// Финал скролл-сцены: собранная банка и огромное ULTRA за ней
export const OUTRO_WORD = 'ULTRA'
export const OUTRO_CAPTION = 'Zero sugar. Ice-cold energy.'
