import { FROST_CUE } from '@/content/final'
import styles from './FrostCue.module.css'

interface FrostCueProps {
  onBreak: () => void
}

// Подсказка поверх инея финального экрана: значок-«скребок» (то же кольцо,
// что у курсора, по нему проходит точка — жест протирания), текст и кнопка
// «Break the ice» — для клавиатуры и для тех, кому протирать не хочется.
// Текст под устройство: мышью стекло протирают курсором, на сенсорном экране
// — пальцем; лишний вариант скрыт медиазапросом (и от скринридера тоже).
export function FrostCue({ onBreak }: FrostCueProps) {
  return (
    <div className={styles.cue}>
      <span className={styles.hint}>
        <span className={styles.ring} aria-hidden="true">
          <span className={styles.dot} />
        </span>
        <span className={styles.pointer}>{FROST_CUE.pointer}</span>
        <span className={styles.touch}>{FROST_CUE.touch}</span>
      </span>
      <button className={styles.button} type="button" onClick={onBreak}>
        {FROST_CUE.action}
      </button>
    </div>
  )
}
