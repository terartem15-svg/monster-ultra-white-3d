import type { Feature } from '@/content/site'
import styles from './FeatureCard.module.css'

interface FeatureCardProps {
  feature: Feature
  index: number
}

// Карточка-преимущество из четырёх "плашек" референса, в холодном стиле:
// матовое ледяное стекло со скосом, голубой свет падает со стороны банки.
//
// Две обёртки — два независимых слоя анимации: li двигает скролл-сцена
// (карточки разъезжаются к краям), .inner — вступление при загрузке.
// Анимируй их одну и ту же — анимации затирали бы друг друга.
export function FeatureCard({ feature, index }: FeatureCardProps) {
  const number = String(index + 1).padStart(2, '0')
  return (
    <li className={styles.card} data-glow={feature.glow} data-hero-card={index % 2 === 0 ? 'left' : 'right'}>
      <div className={styles.inner} data-intro="card">
        {/* Порядковый номер уже объявляет сам список (ol) — дубль для
            скринридера скрыт */}
        <span className={styles.number} aria-hidden="true">
          {number}
        </span>
        <p className={styles.text}>
          <strong>{feature.title}</strong> {feature.text}
        </p>
      </div>
    </li>
  )
}
