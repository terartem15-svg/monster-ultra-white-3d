import type Lenis from 'lenis'
import type { FinalPanelId } from '@/content/final'

// Навигация по главам: какая глава сейчас на экране (её пункт меню получает
// aria-current) и куда вести пункт меню. Главы сами сообщают и то и другое:
// только секция знает, где у неё "начало" — у Коллекции это не верх секции,
// а момент, когда первая банка уже стоит на месте после стыка с Hero.
//
// Активная глава меняется редко (на границах глав), поэтому это маленький
// store с подпиской для useSyncExternalStore, а не поле в motion.

// cold, inside и final — главы «Холод», «Состав» и финальный экран: своих
// пунктов в меню у них нет, поэтому, пока они на экране, в меню не
// подсвечено ничего. about — футер (блок «About this page»)
export type SectionId = 'top' | 'lineup' | 'cold' | 'inside' | 'final' | 'about'
// Куда можно перейти: главы и демо-панели финала (кнопки шапки)
export type AnchorId = SectionId | FinalPanelId

let active: SectionId = 'top'
const listeners = new Set<() => void>()

export function setActiveSection(id: SectionId) {
  if (id === active) return
  active = id
  for (const listener of listeners) listener()
}

export function getActiveSection(): SectionId {
  return active
}

export function subscribeActiveSection(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Точка прокрутки (px от верха документа) и элемент, который получит фокус
interface SectionAnchor {
  top: () => number
  element: () => HTMLElement | null
  // Фокус — только когда скролл доехал: поле демо-панели финала скрыто,
  // пока иней на стекле не разбит, а разбивается он по пути
  focusOnArrival?: boolean
}

const anchors = new Map<AnchorId, SectionAnchor>()

export function registerSectionAnchor(id: AnchorId, anchor: SectionAnchor) {
  anchors.set(id, anchor)
  return () => {
    if (anchors.get(id) === anchor) anchors.delete(id)
  }
}

export function hasSectionAnchor(id: string): id is AnchorId {
  return anchors.has(id as AnchorId)
}

// Плавный переход к точке: через Lenis — с длительностью по расстоянию
// (соседняя банка — быстро, через всю страницу — дольше, но не вечность);
// без Lenis ("уменьшить движение") — сразу. onArrive — когда доехали: без
// Lenis через два кадра — ScrollTrigger успевает обновить главы по новой прокрутке
export function scrollToPosition(top: number, lenis: Lenis | null, onArrive?: () => void) {
  if (lenis) {
    const screens = Math.abs(top - window.scrollY) / window.innerHeight
    lenis.scrollTo(top, { duration: Math.min(2.2, 0.8 + screens * 0.22), force: true, onComplete: onArrive })
  } else {
    window.scrollTo({ top, behavior: 'instant' })
    if (onArrive) requestAnimationFrame(() => requestAnimationFrame(onArrive))
  }
}

// Переход к главе из меню. Фокус переносится в главу (как у обычной
// якорной ссылки): следующий Tab продолжит с её содержимого, а не с шапки.
export function navigateToSection(id: AnchorId, lenis: Lenis | null) {
  const anchor = anchors.get(id)
  if (!anchor) return
  const focus = () => anchor.element()?.focus({ preventScroll: true })
  if (anchor.focusOnArrival) {
    scrollToPosition(anchor.top(), lenis, focus)
  } else {
    scrollToPosition(anchor.top(), lenis)
    focus()
  }
}
