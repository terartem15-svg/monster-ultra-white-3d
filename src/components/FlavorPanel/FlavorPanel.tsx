import type { CSSProperties } from 'react'
import { FLAVORS, LINEUP_FACTS_TITLE, LINEUP_NOTE, LINEUP_TITLE } from '@/content/flavors'
import styles from './FlavorPanel.module.css'

interface FlavorPanelProps {
  index: number
}

const pad = (value: number) => String(value).padStart(2, '0')

// Стеклянная плашка главы «Коллекция» — в стиле карточек первого экрана:
// матовое стекло со скосом, свечение цвета текущего вкуса. Внутри —
// название, одна строка о вкусе и маленькая таблица "с этикетки",
// набранная как Nutrition Facts на самих банках: жирная плашка заголовка,
// толстые и тонкие линейки, цифры справа.
//
// Все вкусы лежат стопкой в одной ячейке сетки: высота плашки не прыгает,
// а смена вкуса — это переход прозрачности между слоями (CSS transitions:
// быстрый скролл туда-обратно просто разворачивает их на полпути). Слои до
// текущего ждут чуть выше, после — чуть ниже: вперёд по коллекции текст
// уходит вверх и приходит снизу, назад — наоборот, без отдельного флага.
//
// Стопка скрыта от скринридера: для него в секции есть полный список.
export function FlavorPanel({ index }: FlavorPanelProps) {
  const flavor = FLAVORS[index]
  return (
    <div className={styles.panel} style={{ '--flavor-accent': flavor.palette.accent } as CSSProperties}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <h2 id="lineup-title" className={styles.title}>
            {LINEUP_TITLE}
          </h2>
          <p className={styles.count} aria-hidden="true">
            <span className={styles.countCurrent}>{pad(index + 1)}</span>
            <span className={styles.countTotal}>/{pad(FLAVORS.length)}</span>
          </p>
        </div>

        <div className={styles.stack} aria-hidden="true">
          {FLAVORS.map((item, itemIndex) => (
            <div
              key={item.id}
              className={styles.item}
              data-state={itemIndex === index ? 'active' : itemIndex < index ? 'before' : 'after'}
            >
              <p className={styles.name}>{item.name}</p>
              <p className={styles.tagline}>{item.tagline}</p>
              <div className={styles.facts}>
                <p className={styles.factsTitle}>{LINEUP_FACTS_TITLE}</p>
                <dl className={styles.factList}>
                  {item.facts.map((fact) => (
                    <div key={fact.label} className={styles.fact}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </div>

        <p className={styles.note}>{LINEUP_NOTE}</p>
      </div>
    </div>
  )
}
