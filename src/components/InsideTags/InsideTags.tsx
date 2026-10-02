import { useRef, type CSSProperties, type RefObject } from 'react'
import { INGREDIENTS } from '@/content/inside'
import { useDockTracking } from '@/hooks/useDockTracking'
import { insideTagNodes, type InsideTagNodes } from '@/state/inside'
import styles from './InsideTags.module.css'

// Узлы метки приходят по одному (ref-колбэки React) — копим их здесь и
// отдаём сцене только полный набор (как у выносок первого экрана)
const pending: Partial<InsideTagNodes>[] = []

function register<K extends keyof InsideTagNodes>(index: number, key: K, node: InsideTagNodes[K] | null) {
  const entry = (pending[index] ??= {})
  if (node) entry[key] = node
  else delete entry[key]
  const { tag, line, dot } = entry
  insideTagNodes[index] = tag && line && dot ? { tag, line, dot } : null
}

const pad = (value: number) => String(value).padStart(2, '0')

// Метки стоят по пологой дуге вокруг банки: средние — дальше от неё
const arc = (index: number) => Math.sin((Math.PI * index) / Math.max(1, INGREDIENTS.length - 1))

interface InsideTagsProps {
  // Текущая остановка; у итоговой (после всех ингредиентов) текущей метки нет
  active: number
  onSelect: (index: number) => void
  // Sticky-экран главы: причалы капсул меряются относительно него
  frameRef: RefObject<HTMLElement | null>
}

// Метки ингредиентов главы «Состав» — колонка рядом с банкой. У каждой метки
// встаёт своя капсула (three/inside/InsideCapsules.tsx): место капсулы —
// «причал» слева от метки — задаёт CSS, сцена его только читает. Пока
// капсула в банке, метка приглушена; причалила — метка в полную силу
// (--docked пишет сцена).
//
// Метки — настоящие кнопки, как отметки шкал в прошлых главах: клик или
// Enter ведут скролл к этому ингредиенту. Текущая — aria-current.
export function InsideTags({ active, onSelect, frameRef }: InsideTagsProps) {
  const listRef = useRef<HTMLOListElement>(null)
  useDockTracking(listRef, frameRef)

  return (
    <ol ref={listRef} className={styles.tags} aria-label="Ingredients">
      {INGREDIENTS.map((ingredient, index) => (
        <li key={ingredient.id} className={styles.item} style={{ '--arc': arc(index), '--tag-color': ingredient.color } as CSSProperties}>
          <button
            type="button"
            className={styles.tag}
            aria-current={index === active ? 'true' : undefined}
            onClick={() => onSelect(index)}
            ref={(node) => register(index, 'tag', node)}
            data-inside-tag
          >
            {/* Причал: правый край — где стоит капсула, ширина — насколько
                текущая капсула выдвигается к банке */}
            <span className={styles.dock} aria-hidden="true" data-inside-dock />
            <span className={styles.content}>
              <span className={styles.number} aria-hidden="true">
                {pad(index + 1)}
              </span>
              <span className={styles.name}>{ingredient.name}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

// Линии-выноски от капсул к меткам — слой во весь экран главы: координаты
// совпадают с canvas. Точки и длину линий каждый кадр пишет сцена.
export function InsideLines() {
  return (
    <svg className={styles.lines} aria-hidden="true">
      {INGREDIENTS.map((ingredient, index) => (
        <g key={ingredient.id} style={{ '--tag-color': ingredient.color } as CSSProperties}>
          <line className={styles.line} ref={(node) => register(index, 'line', node)} />
          <circle className={styles.dot} r="3.5" ref={(node) => register(index, 'dot', node)} />
        </g>
      ))}
    </svg>
  )
}
