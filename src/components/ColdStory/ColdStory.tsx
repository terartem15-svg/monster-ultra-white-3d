import { COLD_NOTE, COLD_STOPS, COLD_TITLE } from '@/content/cold'
import styles from './ColdStory.module.css'

interface ColdStoryProps {
  index: number
}

const pad = (value: number) => String(value).padStart(2, '0')

// Текст главы «Холод» — без карточки, прямо на ночном небе: над ним тонкая
// ледяная линия и название главы, дальше — что происходит с банкой на этой
// остановке и пометка «демо». Температуру показывает табло (ColdReadout),
// здесь её нет.
//
// Как в плашках прошлых глав, все остановки лежат стопкой в одной ячейке:
// высота не прыгает, вперёд по главе текст уходит вверх, назад — вниз.
// Стопка скрыта от скринридера: для него в секции есть полный список.
export function ColdStory({ index }: ColdStoryProps) {
  return (
    <div className={styles.story}>
      <div className={styles.top}>
        <h2 id="cold-title" className={styles.eyebrow}>
          {COLD_TITLE}
        </h2>
        <p className={styles.count} aria-hidden="true">
          <span className={styles.countCurrent}>{pad(index + 1)}</span>/{pad(COLD_STOPS.length)}
        </p>
      </div>

      <div className={styles.stack} aria-hidden="true">
        {COLD_STOPS.map((stop, stopIndex) => (
          <div
            key={stop.id}
            className={styles.item}
            data-state={stopIndex === index ? 'active' : stopIndex < index ? 'before' : 'after'}
          >
            <p className={styles.title}>{stop.title}</p>
            <p className={styles.text}>{stop.text}</p>
          </div>
        ))}
      </div>

      <p className={styles.note}>{COLD_NOTE}</p>
    </div>
  )
}
