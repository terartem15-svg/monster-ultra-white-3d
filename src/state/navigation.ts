import type Lenis from 'lenis'

// Навигация по главам: какая глава сейчас на экране (её пункт меню получает
// aria-current) и куда вести пункт меню. Главы сами сообщают и то и другое:
// только секция знает, где у неё "начало" — у Коллекции это не верх секции,
// а момент, когда первая банка уже стоит на месте после стыка с Hero.
//
// Активная глава меняется редко (на границах глав), поэтому это маленький
// store с подпиской для useSyncExternalStore, а не поле в motion.

export type SectionId = 'top' | 'lineup'

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
}

const anchors = new Map<SectionId, SectionAnchor>()

export function registerSectionAnchor(id: SectionId, anchor: SectionAnchor) {
  anchors.set(id, anchor)
  return () => {
    if (anchors.get(id) === anchor) anchors.delete(id)
  }
}

export function hasSectionAnchor(id: string): id is SectionId {
  return anchors.has(id as SectionId)
}

// Плавный переход к точке: через Lenis — с длительностью по расстоянию
// (соседняя банка — быстро, через всю страницу — дольше, но не вечность);
// без Lenis ("уменьшить движение") — сразу.
export function scrollToPosition(top: number, lenis: Lenis | null) {
  if (lenis) {
    const screens = Math.abs(top - window.scrollY) / window.innerHeight
    lenis.scrollTo(top, { duration: Math.min(2.2, 0.8 + screens * 0.22), force: true })
  } else {
    window.scrollTo({ top, behavior: 'instant' })
  }
}

// Переход к главе из меню. Фокус переносится в главу (как у обычной
// якорной ссылки): следующий Tab продолжит с её содержимого, а не с шапки.
export function navigateToSection(id: SectionId, lenis: Lenis | null) {
  const anchor = anchors.get(id)
  if (!anchor) return
  scrollToPosition(anchor.top(), lenis)
  anchor.element()?.focus({ preventScroll: true })
}
