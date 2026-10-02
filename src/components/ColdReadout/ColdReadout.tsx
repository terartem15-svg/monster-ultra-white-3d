import type { RefObject } from 'react'
import { COLD_READOUT_LABEL, COLD_STATES, type ColdStateId } from '@/content/cold'
import styles from './ColdReadout.module.css'

interface ColdReadoutProps {
  // Корень табло: скролл (animations/coldScroll.ts) находит в нём колёса
  // цифр по data-readout и крутит их мимо React
  rootRef: RefObject<HTMLDivElement | null>
  // Состояние поверхности — меняется редко, на порогах; его ведёт React
  state: ColdStateId
}

// Цифры колеса: 0…9 и ещё раз 0 — чтобы 9 → 0 прокручивалось вперёд, а не
// проматывало колесо назад через все цифры
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

function Wheel({ part }: { part: 'tens' | 'ones' }) {
  return (
    <span className={styles.wheel} data-readout={`${part}-wheel`}>
      <span className={styles.strip} data-readout={part}>
        {DIGITS.map((digit, index) => (
          <span key={index} className={styles.digit}>
            {digit}
          </span>
        ))}
      </span>
    </span>
  )
}

// Табло главы «Холод»: температура поверхности банки огромными цифрами —
// широким Archivo, как надписи на банке. Цифры — колёса счётчика: они
// прокручиваются строго за скроллом, и между градусами видны обе соседние
// цифры. Старший разряд прячется ниже десяти, ниже нуля на его месте
// проступает минус. В мороз цифры белеют и покрываются инеем (--frost
// пишет скролл). Под числом — состояние поверхности: сухо, конденсат,
// замерзает, в инее.
//
// Число скрыто от скринридера: оно меняется непрерывно, а температуру
// каждой остановки он прочтёт в тексте главы.
export function ColdReadout({ rootRef, state }: ColdReadoutProps) {
  const current = COLD_STATES.find((entry) => entry.id === state) ?? COLD_STATES[0]
  return (
    <div ref={rootRef} className={styles.readout}>
      <p className={styles.label}>{COLD_READOUT_LABEL}</p>
      <p className={styles.value} aria-hidden="true" data-readout="value">
        <span className={styles.lead} data-readout="lead">
          <Wheel part="tens" />
          <span className={styles.minus} data-readout="minus">
            −
          </span>
        </span>
        <Wheel part="ones" />
        <span className={styles.degree}>°</span>
      </p>
      <p className={styles.status} data-state={state}>
        {/* Ключи — на смене состояния точка вспыхивает, а слово проявляется
            заново, а не подменяется молча */}
        <span key={`dot-${state}`} className={styles.dot} aria-hidden="true" />
        <span key={`text-${state}`} className={styles.statusText}>
          {current.label}
        </span>
      </p>
    </div>
  )
}
