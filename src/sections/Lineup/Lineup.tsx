import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { FlavorPanel } from '@/components/FlavorPanel/FlavorPanel'
import { LineupRail } from '@/components/LineupRail/LineupRail'
import { FLAVORS, LINEUP_FACTS_TITLE } from '@/content/flavors'
import { createLineupScroll, lineupScrollTop } from '@/animations/lineupScroll'
import { lineupDistance } from '@/animations/scrollPhases'
import { useLenis } from '@/hooks/useLenis'
import { useSlotTracking } from '@/hooks/useSlotTracking'
import { motion, type SlotRect } from '@/state/motion'
import { registerSectionAnchor, scrollToPosition } from '@/state/navigation'
import styles from './Lineup.module.css'

// Глава «Коллекция» (Lineup). Как и первый экран — секция выше экрана со
// sticky-блоком внутри; скролл ведёт банки по очереди: текущая крупно в
// центре, следующая виднеется сбоку в глубине, предыдущая улетает с
// оборотом (three/lineup/*). Здесь — только DOM: пустой слот под банку,
// стеклянная плашка вкуса, шкала прогресса и полный список вкусов для
// скринридера (визуальная плашка показывает один вкус и скрыта от него).
//
// Высота секции — из тех же чисел, что и тайминги (animations/scrollPhases.ts).

const writeSlot = (rect: SlotRect) => {
  motion.lineupSlot = rect
}

const SECTION_STYLE = {
  '--lineup-scroll': lineupDistance('regular', FLAVORS.length),
  '--lineup-scroll-compact': lineupDistance('compact', FLAVORS.length),
} as CSSProperties

export function Lineup() {
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const travelRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const [active, setActive] = useState(0)
  const lenis = useLenis()

  useSlotTracking(slotRef, viewportRef, writeSlot)

  useEffect(() => {
    const section = sectionRef.current
    const viewport = viewportRef.current
    const travel = travelRef.current
    const fill = fillRef.current
    if (!section || !viewport || !travel || !fill) return
    return createLineupScroll(section, {
      viewport,
      rail: { travel, fill },
      onActiveChange: setActive,
    })
  }, [])

  // Пункт меню Lineup ведёт не к верху секции (там ещё финал первого
  // экрана), а к первой банке, уже стоящей на месте
  useEffect(() => {
    return registerSectionAnchor('lineup', {
      top: () => {
        const section = sectionRef.current
        const viewport = viewportRef.current
        return section && viewport ? lineupScrollTop(section, viewport, 0) : 0
      },
      element: () => sectionRef.current,
    })
  }, [])

  const handleSelect = useCallback(
    (index: number) => {
      const section = sectionRef.current
      const viewport = viewportRef.current
      if (section && viewport) scrollToPosition(lineupScrollTop(section, viewport, index), lenis)
    },
    [lenis],
  )

  return (
    <section
      id="lineup"
      ref={sectionRef}
      className={styles.lineup}
      style={SECTION_STYLE}
      aria-labelledby="lineup-title"
      tabIndex={-1}
    >
      <div ref={viewportRef} className={styles.viewport}>
        <div className={styles.grid}>
          <div ref={slotRef} className={styles.stage} aria-hidden="true" />
          {/* Две обёртки — два слоя анимации: внешняя проявляется на стыке
              с первым экраном, внутренняя гаснет на стыке с «Холодом» */}
          <div className={styles.panelSlot} data-lineup-ui>
            <div data-lineup-exit>
              <FlavorPanel index={active} />
            </div>
          </div>
        </div>

        <div className={styles.railSlot} data-lineup-ui>
          <div data-lineup-exit>
            <LineupRail active={active} onSelect={handleSelect} travelRef={travelRef} fillRef={fillRef} />
          </div>
        </div>
      </div>

      {/* Весь список — для скринридера: плашка на экране показывает только
          текущий вкус и зависит от скролла */}
      <ol className="visually-hidden">
        {FLAVORS.map((flavor) => (
          <li key={flavor.id}>
            <p>
              {flavor.name}. {flavor.tagline}
            </p>
            <p>{LINEUP_FACTS_TITLE}:</p>
            <dl>
              {flavor.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  )
}
