import type { CSSProperties, RefObject } from 'react'
import {
  COLD_PHYSICS,
  COLD_SCALE,
  COLD_STATES,
  COLD_STOPS,
  COLD_THRESHOLDS,
  formatDegrees,
  formatTemperature,
  type ColdStateId,
} from '@/content/cold'
import styles from './ColdTrack.module.css'

interface ColdTrackProps {
  active: number
  onSelect: (index: number) => void
  // Узлы, которые двигает скролл (animations/coldScroll.ts) — мимо React
  travelRef: RefObject<HTMLSpanElement | null>
  fillRef: RefObject<HTMLSpanElement | null>
  // Состояние поверхности: по нему загораются пройденные пороги
  surface: ColdStateId
}

// Порог пройден, если состояние поверхности уже «после» него
const passed = (threshold: number, surface: ColdStateId) => {
  const current = COLD_STATES.findIndex((state) => state.id === surface)
  const at = COLD_STATES.findIndex((state) => state.below === threshold)
  return at >= 0 && current >= at
}

const RANGE = COLD_SCALE.top - COLD_SCALE.bottom
// Доля ширины шкалы для температуры: 0 — слева (тепло), 1 — справа (мороз)
const at = (temperature: number) => (COLD_SCALE.top - temperature) / RANGE

// Зоны шкалы — что происходит с банкой в этом диапазоне
const ZONES = [
  { id: 'dry', from: COLD_SCALE.top, to: COLD_PHYSICS.dewPoint },
  { id: 'wet', from: COLD_PHYSICS.dewPoint, to: COLD_PHYSICS.freezing },
  { id: 'frozen', from: COLD_PHYSICS.freezing, to: COLD_SCALE.bottom },
]

const TRACK_STYLE = { '--degrees': RANGE } as CSSProperties

// Шкала температуры главы «Холод» — горизонтальная, как шкала коллекции:
// слева тепло, справа мороз. Три зоны — сухо, конденсат, лёд — и два
// подписанных порога между ними; деления — по градусу. По шкале едет кольцо
// (мотив курсора сайта) строго за скроллом, за ним тянется светящийся след.
//
// Под шкалой — остановки главы: настоящие кнопки, как отметки коллекции,
// клик или Enter ведут скролл к этой температуре. Текущая — aria-current.
export function ColdTrack({ active, onSelect, travelRef, fillRef, surface }: ColdTrackProps) {
  return (
    <div className={styles.track} style={TRACK_STYLE}>
      <div className={styles.rail} aria-hidden="true">
        {ZONES.map((zone) => (
          <span
            key={zone.id}
            className={styles.zone}
            data-zone={zone.id}
            style={{ '--from': at(zone.from), '--to': at(zone.to) } as CSSProperties}
          />
        ))}
        <span className={styles.ticks} />
        <span ref={fillRef} className={styles.fill} />
        {COLD_THRESHOLDS.map((mark) => (
          <span
            key={mark.label}
            className={styles.threshold}
            style={{ '--at': at(mark.temperature) } as CSSProperties}
            data-passed={passed(mark.temperature, surface)}
          >
            <span className={styles.thresholdText}>
              <b>{formatDegrees(mark.temperature)}</b> {mark.label}
            </span>
          </span>
        ))}
        <span ref={travelRef} className={styles.travel}>
          <span className={styles.ring} />
        </span>
      </div>

      <ol className={styles.stops} aria-label="Temperature stops">
        {COLD_STOPS.map((stop, index) => (
          <li key={stop.id} className={styles.stop} style={{ '--at': at(stop.temperature) } as CSSProperties}>
            <button
              type="button"
              className={styles.button}
              aria-current={index === active ? 'true' : undefined}
              aria-label={`${stop.title.replace(/\.$/, '')}, ${formatTemperature(stop.temperature)}`}
              onClick={() => onSelect(index)}
            >
              <span className={styles.notch} aria-hidden="true" />
              <span className={styles.stopValue} aria-hidden="true">
                {formatDegrees(stop.temperature)}
              </span>
              <span className={styles.stopLabel} aria-hidden="true">
                {stop.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
