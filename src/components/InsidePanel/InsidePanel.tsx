import { Fragment, type CSSProperties } from 'react'
import {
  INGREDIENTS,
  INSIDE_FACTS_TITLE,
  INSIDE_LIST_TITLE,
  INSIDE_NOTE,
  INSIDE_SUMMARY,
  INSIDE_TITLE,
} from '@/content/inside'
import styles from './InsidePanel.module.css'

interface InsidePanelProps {
  // Остановка главы: 0..N−1 — ингредиенты, N — итог с полным списком
  index: number
}

const pad = (value: number) => String(value).padStart(2, '0')

const state = (item: number, index: number) => (item === index ? 'active' : item < index ? 'before' : 'after')

// Значение таблицы переносится только между словами: «L-carnitine L-tartrate»
// в узкой колонке не должно рваться на дефисе
function Words({ text }: { text: string }) {
  return text.split(' ').map((word, index) => (
    <Fragment key={index}>
      {index > 0 && ' '}
      <span className={styles.word}>{word}</span>
    </Fragment>
  ))
}

// Стеклянная плашка главы «Состав» — та же, что у коллекции: матовое стекло
// со скосом, свечение со стороны банки — цвета текущей капсулы. Внутри —
// ингредиент, одна фраза о нём и таблица «From the label» в духе Nutrition
// Facts; на итоговой остановке вместо таблицы — полный список ингредиентов,
// набранный как на самой банке: узким шрифтом, подряд, через запятую.
//
// Как в плашках прошлых глав, все остановки лежат стопкой в одной ячейке
// сетки: высота не прыгает, смена — переход прозрачности между слоями.
// Стопка скрыта от скринридера: для него в секции есть полный текст.
export function InsidePanel({ index }: InsidePanelProps) {
  const summary = index >= INGREDIENTS.length
  const accent = summary ? INSIDE_SUMMARY.color : INGREDIENTS[index].color
  return (
    <div className={styles.panel} style={{ '--inside-accent': accent } as CSSProperties}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <h2 id="inside-title" className={styles.title}>
            {INSIDE_TITLE}
          </h2>
          {/* Номер капсулы; на итоговой остановке он гаснет — капсулы уже в банке */}
          <p className={styles.count} data-hidden={summary} aria-hidden="true">
            <span className={styles.countCurrent}>{pad(Math.min(index, INGREDIENTS.length - 1) + 1)}</span>
            <span className={styles.countTotal}>/{pad(INGREDIENTS.length)}</span>
          </p>
        </div>

        <div className={styles.stack} aria-hidden="true">
          {INGREDIENTS.map((item, itemIndex) => (
            <div key={item.id} className={styles.item} data-state={state(itemIndex, index)}>
              <p className={styles.name}>{item.name}</p>
              <p className={styles.text}>{item.text}</p>
              <div className={styles.facts}>
                <p className={styles.factsTitle}>{INSIDE_FACTS_TITLE}</p>
                <dl className={styles.factList}>
                  {item.facts.map((fact) => (
                    <div key={fact.label} className={styles.fact}>
                      <dt>{fact.label}</dt>
                      <dd>
                        <Words text={fact.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
          <div className={styles.item} data-state={state(INGREDIENTS.length, index)}>
            <p className={styles.name}>{INSIDE_SUMMARY.name}</p>
            <p className={styles.text}>{INSIDE_SUMMARY.text}</p>
            <div className={styles.facts}>
              <p className={styles.factsTitle}>{INSIDE_LIST_TITLE}</p>
              <p className={styles.list}>{INSIDE_SUMMARY.list}</p>
            </div>
          </div>
        </div>

        <p className={styles.note}>{INSIDE_NOTE}</p>
      </div>
    </div>
  )
}
