import type { CSSProperties, RefObject } from 'react'
import { FLAVORS } from '@/content/flavors'
import styles from './LineupRail.module.css'

interface LineupRailProps {
  active: number
  onSelect: (index: number) => void
  // Узлы, которые двигает скролл (animations/lineupScroll.ts) — мимо React
  travelRef: RefObject<HTMLSpanElement | null>
  fillRef: RefObject<HTMLSpanElement | null>
}

const RAIL_STYLE = { '--count': FLAVORS.length } as CSSProperties

// Шкала прогресса коллекции: тонкая линия с цветной отметкой на каждый
// вкус. По ней едет кольцо — тот же мотив, что у курсора сайта, — строго за
// скроллом, поэтому между банками оно стоит между отметками. Отметки —
// настоящие кнопки: клик или Enter плавно ведут скролл к этой банке, на
// мыши над отметкой всплывает название. Текущая отметка — aria-current.
export function LineupRail({ active, onSelect, travelRef, fillRef }: LineupRailProps) {
  return (
    <div className={styles.rail} style={RAIL_STYLE}>
      <span className={styles.track} aria-hidden="true">
        <span ref={fillRef} className={styles.fill} />
      </span>
      <span ref={travelRef} className={styles.travel} aria-hidden="true">
        <span className={styles.ring} />
      </span>
      <ol className={styles.list} aria-label="Flavors in the lineup">
        {FLAVORS.map((flavor, index) => (
          <li key={flavor.id} className={styles.item}>
            <button
              type="button"
              className={styles.notch}
              style={{ '--notch-color': flavor.palette.accent } as CSSProperties}
              aria-current={index === active ? 'true' : undefined}
              onClick={() => onSelect(index)}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.tip}>{flavor.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
