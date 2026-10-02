import { useId } from 'react'
import {
  CLAW_STROKES,
  LOGO_HEIGHT,
  LOGO_WIDTH,
  WORDMARK_OFFSET,
  WORDMARK_PATH,
} from '@/brand/logoPaths'
import styles from './Logo.module.css'

interface LogoProps {
  className?: string
  // Только коготь, без надписи — для прелоадера
  clawOnly?: boolean
}

// Запас вокруг контуров: обводка когтя выходит за его габарит
const PAD = 4

// Логотип Monster из векторных контуров (brand/logoPaths.ts): коготь в стиле
// банки Ultra White — ледяная заливка и тёмно-синяя обводка — и надпись
// MONSTER. Цвет обводки и надписи — --logo-ink (по умолчанию тёмно-синий):
// в тёмной главе шапка делает его светлым. Коготь аккуратно "парит": вся
// группа медленно поднимается и опускается, а каждый штрих чуть отстаёт от
// соседнего; изредка по когтю пробегает ледяной блик. Анимация — чистый CSS
// (Logo.module.css), при "уменьшить движение" отключается.
export function Logo({ className, clawOnly = false }: LogoProps) {
  // Уникальные id градиентов: логотип на странице может стоять не один раз
  const id = useId()
  const iceId = `${id}-ice`
  const clipId = `${id}-clip`
  const glintId = `${id}-glint`
  const width = clawOnly ? 70 : LOGO_WIDTH

  return (
    <svg
      className={[styles.logo, className].filter(Boolean).join(' ')}
      viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${LOGO_HEIGHT + PAD * 2}`}
      role="img"
      aria-label="Monster"
    >
      <defs>
        <linearGradient id={iceId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f9fd" />
          <stop offset="0.5" stopColor="#d5ecf8" />
          <stop offset="1" stopColor="#8fcbeb" />
        </linearGradient>
        <linearGradient id={glintId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          {CLAW_STROKES.map((d) => (
            <path key={d.slice(0, 24)} d={d} />
          ))}
        </clipPath>
      </defs>

      <g className={styles.claw}>
        {CLAW_STROKES.map((d, index) => (
          <path
            key={d.slice(0, 24)}
            className={styles.stroke}
            style={{ animationDelay: `${index * -1.7}s` }}
            d={d}
            fill={`url(#${iceId})`}
            stroke="var(--logo-ink, var(--c-navy))"
            strokeWidth="5"
            strokeLinejoin="round"
            paintOrder="stroke"
          />
        ))}
        <g clipPath={`url(#${clipId})`}>
          <rect className={styles.glint} x="-30" y="-10" width="26" height="130" fill={`url(#${glintId})`} />
        </g>
      </g>

      {!clawOnly && (
        <path
          className={styles.wordmark}
          d={WORDMARK_PATH}
          transform={`translate(${WORDMARK_OFFSET.x} ${WORDMARK_OFFSET.y})`}
          fill="var(--logo-ink, var(--c-navy))"
          fillRule="evenodd"
        />
      )}
    </svg>
  )
}
