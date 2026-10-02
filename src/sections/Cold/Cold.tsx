import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ColdReadout } from '@/components/ColdReadout/ColdReadout'
import { ColdStory } from '@/components/ColdStory/ColdStory'
import { ColdTrack } from '@/components/ColdTrack/ColdTrack'
import { COLD_STOPS, formatTemperature, type ColdStateId } from '@/content/cold'
import { coldScrollTop, createColdScroll } from '@/animations/coldScroll'
import { coldDistance } from '@/animations/scrollPhases'
import { useLenis } from '@/hooks/useLenis'
import { useSlotTracking } from '@/hooks/useSlotTracking'
import { motion, type SlotRect } from '@/state/motion'
import { registerSectionAnchor, scrollToPosition } from '@/state/navigation'
import styles from './Cold.module.css'

// Глава «Холод» — полярная ночь, единственная тёмная глава. Небо темнеет,
// разгорается северное сияние, а скролл остужает банку: она покрывается
// росой, каплями, потом инеем; с неё стекает морозный пар, в воздухе
// вспыхивает ледяная пыль (three/can/cold/*, three/coldAir/*, небо —
// three/Backdrop.tsx). Банка та же, что в конце коллекции (Ultra Baltic).
//
// Здесь — только DOM: огромное табло температуры слева (цифры крутятся за
// скроллом), пустой слот под банку, текст остановки справа, шкала
// температуры внизу и полный текст остановок для скринридера.
//
// Высота секции — из тех же чисел, что и тайминги (animations/scrollPhases.ts).

const writeSlot = (rect: SlotRect) => {
  motion.coldSlot = rect
}

const SECTION_STYLE = {
  '--cold-scroll': coldDistance('regular', COLD_STOPS.length),
  '--cold-scroll-compact': coldDistance('compact', COLD_STOPS.length),
} as CSSProperties

export function Cold() {
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const travelRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const [active, setActive] = useState(0)
  const [surface, setSurface] = useState<ColdStateId>('dry')
  const lenis = useLenis()

  useSlotTracking(slotRef, viewportRef, writeSlot)

  useEffect(() => {
    const section = sectionRef.current
    const viewport = viewportRef.current
    const readout = readoutRef.current
    const travel = travelRef.current
    const fill = fillRef.current
    if (!section || !viewport || !readout || !travel || !fill) return
    return createColdScroll(section, {
      viewport,
      readout,
      track: { travel, fill },
      onActiveChange: setActive,
      onSurfaceChange: setSurface,
    })
  }, [])

  // Ссылка футера ведёт к первой остановке, банка уже на месте
  useEffect(() => {
    return registerSectionAnchor('cold', {
      top: () => {
        const section = sectionRef.current
        const viewport = viewportRef.current
        return section && viewport ? coldScrollTop(section, viewport, 0) : 0
      },
      element: () => sectionRef.current,
    })
  }, [])

  const handleSelect = useCallback(
    (index: number) => {
      const section = sectionRef.current
      const viewport = viewportRef.current
      if (section && viewport) scrollToPosition(coldScrollTop(section, viewport, index), lenis)
    },
    [lenis],
  )

  return (
    <section
      id="cold"
      ref={sectionRef}
      className={styles.cold}
      style={SECTION_STYLE}
      aria-labelledby="cold-title"
      tabIndex={-1}
    >
      <div ref={viewportRef} className={styles.viewport}>
        <div className={styles.grid}>
          <div ref={slotRef} className={styles.stage} aria-hidden="true" />
          {/* Две обёртки — два слоя анимации: внешняя проявляется на стыке
              с коллекцией, внутренняя гаснет на стыке с «Составом» */}
          <div className={styles.readoutSlot} data-cold-ui>
            <div data-cold-exit>
              <ColdReadout rootRef={readoutRef} state={surface} />
            </div>
          </div>
          <div className={styles.storySlot} data-cold-ui>
            <div data-cold-exit>
              <ColdStory index={active} />
            </div>
          </div>
        </div>

        <div className={styles.trackSlot} data-cold-ui>
          <div data-cold-exit>
            <ColdTrack active={active} onSelect={handleSelect} travelRef={travelRef} fillRef={fillRef} surface={surface} />
          </div>
        </div>
      </div>

      {/* Все остановки — для скринридера: текст на экране показывает только
          текущую (пометку «демо» он прочтёт в самом тексте) */}
      <ol className="visually-hidden">
        {COLD_STOPS.map((stop) => (
          <li key={stop.id}>
            <p>
              {formatTemperature(stop.temperature)}, {stop.title} {stop.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
