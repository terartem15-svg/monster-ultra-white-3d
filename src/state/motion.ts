import type { LineupLayout } from '@/animations/scrollPhases'

// Общее изменяемое состояние "DOM ↔ 3D". Скролл, указатель и вступительная
// анимация живут в DOM (GSAP, ScrollTrigger, слушатели окна), а читаются
// каждый кадр в useFrame сцены. Обычный объект, а не React-state: значения
// меняются 60+ раз в секунду, и ререндер на каждое изменение убил бы
// производительность — сцена просто читает актуальные числа в своём цикле.

export interface SlotRect {
  x: number
  y: number
  width: number
  height: number
}

export const motion = {
  // Указатель в координатах NDC three.js: -1..1, ось Y смотрит вверх
  pointer: { x: 0, y: 0 },
  // true, пока указатель над окном; на тач-устройствах почти всегда false
  pointerActive: false,

  // Прогресс вступления 0..1 — его крутит GSAP (animations/intro.ts)
  intro: 0,
  // Прогресс скролл-сцены героя 0..1 — его пишет ScrollTrigger (animations/heroScroll.ts)
  scroll: 0,
  // Прогресс главы «Коллекция» 0..1 (animations/lineupScroll.ts) и её
  // раскладка: на телефоне шаги короче, от этого зависит перевод прогресса
  // в положение банок (animations/scrollPhases.ts)
  lineup: 0,
  lineupLayout: 'regular' as LineupLayout,

  // "Слот" под банку в CSS-пикселях окна: пустой блок в раскладке Hero, куда
  // сцена ставит 3D-композицию. Раскладку решает CSS, 3D под неё подстраивается.
  slot: { x: 0, y: 0, width: 0, height: 0 } as SlotRect,
  // Слот банки в главе «Коллекция» — там, где банка стоит, когда глава на экране
  lineupSlot: { x: 0, y: 0, width: 0, height: 0 } as SlotRect,

  // Системная настройка "уменьшить движение". Читается сразу при загрузке
  // модуля: сцене значение нужно уже на первом рендере (лёд либо влетает
  // из-за кадра, либо сразу стоит на месте); дальше его обновляет App.
  reducedMotion: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
}
