import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { InsidePanel } from '@/components/InsidePanel/InsidePanel'
import { InsideLines, InsideTags } from '@/components/InsideTags/InsideTags'
import { INGREDIENTS, INSIDE_FACTS_TITLE, INSIDE_LIST_TITLE, INSIDE_STOPS, INSIDE_SUMMARY } from '@/content/inside'
import { createInsideScroll, insideScrollTop } from '@/animations/insideScroll'
import { insideDistance } from '@/animations/scrollPhases'
import { useLenis } from '@/hooks/useLenis'
import { useSlotTracking } from '@/hooks/useSlotTracking'
import { motion, type SlotRect } from '@/state/motion'
import { registerSectionAnchor, scrollToPosition } from '@/state/navigation'
import styles from './Inside.module.css'

// Глава «Состав» (What's inside). Ночь «Холода» рассеивается, возвращается
// банка Ultra White и становится стеклянной; из неё по одной поднимаются
// капсулы-ингредиенты и встают у своих меток, а в конце возвращаются
// обратно (three/inside/*, three/can/glass.ts). Здесь — только DOM: пустой
// слот под банку, стеклянная плашка ингредиента слева, колонка меток справа
// (у каждой метки — причал её капсулы), линии-выноски и полный текст для
// скринридера (визуальная плашка показывает одну остановку и скрыта).
//
// Высота секции — из тех же чисел, что и тайминги (animations/scrollPhases.ts).

const writeSlot = (rect: SlotRect) => {
  motion.insideSlot = rect
}

const SECTION_STYLE = {
  '--inside-scroll': insideDistance('regular', INSIDE_STOPS),
  '--inside-scroll-compact': insideDistance('compact', INSIDE_STOPS),
} as CSSProperties

export function Inside() {
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const tagsRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const lenis = useLenis()

  useSlotTracking(slotRef, viewportRef, writeSlot)

  useEffect(() => {
    const section = sectionRef.current
    const viewport = viewportRef.current
    const tags = tagsRef.current
    if (!section || !viewport || !tags) return
    return createInsideScroll(section, { viewport, tags, onActiveChange: setActive })
  }, [])

  // Ссылка футера ведёт к первому ингредиенту, капсула уже у метки
  useEffect(() => {
    return registerSectionAnchor('inside', {
      top: () => {
        const section = sectionRef.current
        const viewport = viewportRef.current
        return section && viewport ? insideScrollTop(section, viewport, 0) : 0
      },
      element: () => sectionRef.current,
    })
  }, [])

  const handleSelect = useCallback(
    (index: number) => {
      const section = sectionRef.current
      const viewport = viewportRef.current
      if (section && viewport) scrollToPosition(insideScrollTop(section, viewport, index), lenis)
    },
    [lenis],
  )

  return (
    <section
      id="inside"
      ref={sectionRef}
      className={styles.inside}
      style={SECTION_STYLE}
      aria-labelledby="inside-title"
      tabIndex={-1}
    >
      <div ref={viewportRef} className={styles.viewport}>
        <div className={styles.grid}>
          <div ref={slotRef} className={styles.stage} aria-hidden="true" />
          {/* Две обёртки: внешняя выплывает на стыке с «Холодом», внутренняя
              гаснет на стыке с финальным экраном */}
          <div className={styles.panelSlot} data-inside-ui="rise">
            <div data-inside-exit>
              <InsidePanel index={active} />
            </div>
          </div>
          {/* Две обёртки — два слоя анимации: внешняя проявляется на стыке с
              «Холодом», внутренняя гаснет, когда капсулы возвращаются в банку */}
          <div className={styles.tagsSlot} data-inside-ui="fade">
            <div ref={tagsRef}>
              <InsideTags active={active} onSelect={handleSelect} frameRef={viewportRef} />
            </div>
          </div>
        </div>
        <InsideLines />
      </div>

      {/* Все остановки — для скринридера: плашка показывает только текущую
          (пометку «демо» он прочтёт в самой плашке) */}
      <div className="visually-hidden">
        <ol>
          {INGREDIENTS.map((ingredient) => (
            <li key={ingredient.id}>
              <p>
                {ingredient.name}. {ingredient.text}
              </p>
              <p>{INSIDE_FACTS_TITLE}:</p>
              <dl>
                {ingredient.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
        <p>
          {INSIDE_SUMMARY.name}. {INSIDE_SUMMARY.text}
        </p>
        <p>
          {INSIDE_LIST_TITLE}: {INSIDE_SUMMARY.list}
        </p>
      </div>
    </section>
  )
}
