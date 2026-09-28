import { Fragment, useEffect, useRef } from 'react'
import { Callouts } from '@/components/Callouts/Callouts'
import { FeatureCard } from '@/components/FeatureCard/FeatureCard'
import { FEATURES, HERO_TITLE_LINES, OUTRO_CAPTION, SCROLL_CUE } from '@/content/site'
import { createHeroScroll } from '@/animations/heroScroll'
import { useSlotTracking } from '@/hooks/useSlotTracking'
import styles from './Hero.module.css'

// Первый экран. Раскладка блоков — как в основном референсе: слева
// карточки 01 и 03, по центру 3D-банка, справа заголовок-вопрос и карточки
// 02 и 04. Сама банка живёт в фиксированном canvas под страницей; здесь для
// неё только пустой "слот" — сцена меряет его и ставит банку ровно туда.
//
// Секция выше экрана: внутренний блок "прилипает" (position: sticky), и
// пока страница прокручивается, скролл ведёт сцену в три главы
// (animations/scrollPhases.ts): карточки разъезжаются и куски банки
// собираются; камера подлетает к банке и к её деталям тянутся выноски;
// в финале за банкой встаёт огромное ULTRA.
export function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)

  useSlotTracking(slotRef)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    return createHeroScroll(section)
  }, [])

  return (
    <section id="top" ref={sectionRef} className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.viewport}>
        <div className={styles.grid}>
          <div ref={slotRef} className={styles.stage} aria-hidden="true" />

          <h1 id="hero-title" className={styles.title} data-hero-title>
            {/* Пробел между строками — снаружи масок: внутри блочной строки
                он схлопывается, и на узких экранах слова слиплись бы */}
            {HERO_TITLE_LINES.map((line, index) => (
              <Fragment key={line}>
                {index > 0 && ' '}
                <span className={styles.line}>
                  <span className={styles.lineInner} data-intro="title-line">
                    {line}
                  </span>
                </span>
              </Fragment>
            ))}
          </h1>

          <ol className={styles.features}>
            {FEATURES.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} index={index} />
            ))}
          </ol>
        </div>

        <div className={styles.cue} data-hero-cue>
          <div className={styles.cueInner} data-intro="cue">
            <span className={styles.cueTrack} aria-hidden="true">
              <span className={styles.cueDot} />
            </span>
            {SCROLL_CUE}
          </div>
        </div>

        <Callouts />

        <p className={styles.outro} data-hero-outro>
          {OUTRO_CAPTION}
        </p>
      </div>
    </section>
  )
}
