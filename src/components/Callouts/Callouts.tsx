import { CALLOUTS } from '@/content/site'
import { calloutNodes, type CalloutNodes } from '@/state/callouts'
import styles from './Callouts.module.css'

// Узлы выноски приходят по одному (ref-колбэки React) — копим их здесь и
// отдаём сцене только полный набор
const pending: Partial<CalloutNodes>[] = []

function register<K extends keyof CalloutNodes>(index: number, key: K, node: CalloutNodes[K] | null) {
  const entry = (pending[index] ??= {})
  if (node) entry[key] = node
  else delete entry[key]
  const { item, label, line, dot, pulse } = entry
  calloutNodes[index] = item && label && line && dot && pulse ? { item, label, line, dot, pulse } : null
}

// Подписи с линиями-выносками к частям банки — сцена деталей в середине
// скролла. Здесь только разметка: где стоят точки, линии и подписи, каждый
// кадр решает 3D-сцена (three/CalloutTracker.tsx) и пишет координаты прямо
// в эти узлы — так линия не отстаёт от точки на вращающейся банке.
//
// Подписи — обычный список: текст чёткий и доступен скринридеру, а
// невидимые в данный момент выноски скрыты (visibility: hidden).
export function Callouts() {
  return (
    <div className={styles.callouts}>
      <svg className={styles.lines} aria-hidden="true">
        {CALLOUTS.map((callout, index) => (
          <g key={callout.title}>
            <polyline className={styles.line} ref={(node) => register(index, 'line', node)} />
            <circle className={styles.pulse} r="9" ref={(node) => register(index, 'pulse', node)} />
            <circle className={styles.dot} r="4" ref={(node) => register(index, 'dot', node)} />
          </g>
        ))}
      </svg>
      <ul className={styles.list} aria-label="Can details">
        {CALLOUTS.map((callout, index) => (
          <li key={callout.title} className={styles.item} ref={(node) => register(index, 'item', node)}>
            <div className={styles.label} ref={(node) => register(index, 'label', node)}>
              <p className={styles.title}>{callout.title}</p>
              <p className={styles.text}>{callout.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
