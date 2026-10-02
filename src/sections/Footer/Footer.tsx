import { useEffect, useId, useRef, type MouseEvent } from 'react'
import { CLAW_HEIGHT, CLAW_STROKES, CLAW_WIDTH } from '@/brand/logoPaths'
import { FOOTER_ABOUT, FOOTER_BOTTOM, FOOTER_CHAPTERS, FOOTER_CREDITS, FOOTER_NOTICE, FOOTER_OFFICIAL } from '@/content/footer'
import { createFooterScroll } from '@/animations/footerScroll'
import { useLenis } from '@/hooks/useLenis'
import { hasSectionAnchor, navigateToSection, registerSectionAnchor, type AnchorId } from '@/state/navigation'
import styles from './Footer.module.css'

// Футер — последний экран страницы: глубокая ночь, огромный силуэт когтя и
// честная подпись под всем сайтом. Наезжает снизу на финальный экран (холст
// сцены уезжает вверх вместе с ним), а когда закрывает окно целиком — сцена
// перестаёт рисовать кадры (animations/footerScroll.ts).
//
// Внутри: блок About (к нему ведёт пункт меню About), заметная пометка, что
// это демо без связи с Monster Energy, переходы по главам, ссылки на
// настоящий бренд, из чего собрана страница и «наверх». Тексты —
// content/footer.ts.
//
// Футер вне <main>: это подпись страницы (landmark contentinfo), а не глава.
// Под прелоадером и открытым мобильным меню он inert, как и главы.

interface FooterProps {
  inert?: boolean
}

// Запас вокруг когтя: обводка выходит за его габарит
const CLAW_PAD = 2

export function Footer({ inert }: FooterProps) {
  const footerRef = useRef<HTMLElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const clawRef = useRef<HTMLDivElement>(null)
  const aboutRef = useRef<HTMLElement>(null)
  const lenis = useLenis()
  const gradientId = `${useId()}-claw`

  useEffect(() => {
    const footer = footerRef.current
    const probe = probeRef.current
    const claw = clawRef.current
    if (!footer || !probe || !claw) return
    return createFooterScroll(footer, { probe, claw })
  }, [])

  // Пункт меню About ведёт к началу футера: футер у верха окна, блок About
  // прямо под шапкой. Фокус — на блок, следующий Tab идёт по ссылкам футера
  useEffect(() => {
    return registerSectionAnchor('about', {
      top: () => {
        const footer = footerRef.current
        return footer ? footer.getBoundingClientRect().top + window.scrollY : 0
      },
      element: () => aboutRef.current,
    })
  }, [])

  // Ссылки на главы — плавный скролл, как у меню; без зарегистрированной
  // точки — обычный якорь
  const handleAnchor = (event: MouseEvent<HTMLAnchorElement>, id: AnchorId) => {
    if (!hasSectionAnchor(id)) return
    event.preventDefault()
    navigateToSection(id, lenis)
  }

  return (
    // data-cursor-tone — курсор над футером светлый, даже пока шапка ещё над
    // светлым финалом (Cursor.module.css)
    <footer id="site-footer" ref={footerRef} className={styles.footer} inert={inert} data-cursor-tone="dark">
      <div ref={probeRef} className={styles.probe} aria-hidden="true" />

      {/* Огромный коготь — те же контуры, что у логотипа (brand/logoPaths.ts) */}
      <div ref={clawRef} className={styles.claw} aria-hidden="true">
        <svg
          className={styles.clawSvg}
          viewBox={`${-CLAW_PAD} ${-CLAW_PAD} ${CLAW_WIDTH + CLAW_PAD * 2} ${CLAW_HEIGHT + CLAW_PAD * 2}`}
          preserveAspectRatio="xMidYMin meet"
        >
          {/* Градиенты — по всей высоте когтя (userSpaceOnUse), а не по
              каждой пряди: все три тают на одной высоте */}
          <defs>
            <linearGradient id={`${gradientId}-fill`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={CLAW_HEIGHT}>
              <stop offset="0" stopColor="var(--c-ice-bright)" stopOpacity="0.2" />
              <stop offset="0.45" stopColor="var(--c-ice-bright)" stopOpacity="0.06" />
              <stop offset="0.75" stopColor="var(--c-ice-bright)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gradientId}-edge`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={CLAW_HEIGHT}>
              <stop offset="0" stopColor="var(--c-ice-bright)" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="var(--c-ice-bright)" stopOpacity="0.16" />
              <stop offset="0.8" stopColor="var(--c-ice-bright)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {CLAW_STROKES.map((d) => (
            <path
              key={d.slice(0, 24)}
              className={styles.clawStroke}
              d={d}
              fill={`url(#${gradientId}-fill)`}
              stroke={`url(#${gradientId}-edge)`}
            />
          ))}
        </svg>
      </div>

      <div className={styles.inner}>
        <section id="about" ref={aboutRef} className={styles.about} aria-labelledby="about-title" tabIndex={-1}>
          <div className={styles.lead}>
            <p className={styles.eyebrow}>{FOOTER_ABOUT.eyebrow}</p>
            <h2 id="about-title" className={styles.title}>
              {FOOTER_ABOUT.title}
            </h2>
          </div>
          <div className={styles.aboutText}>
            {FOOTER_ABOUT.text.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* Пометка о демо — отдельной полосой, крупнее мелкого шрифта */}
        <p className={styles.notice}>
          <span className={styles.badge}>{FOOTER_NOTICE.badge}</span>
          <span className={styles.noticeText}>{FOOTER_NOTICE.text}</span>
        </p>

        <div className={styles.columns}>
          <nav className={styles.column} aria-labelledby="footer-chapters">
            <h3 id="footer-chapters" className={styles.columnTitle}>
              {FOOTER_CHAPTERS.title}
            </h3>
            <ul className={styles.links}>
              {FOOTER_CHAPTERS.links.map((link) => (
                <li key={link.anchor}>
                  <a className={styles.link} href={link.href} onClick={(event) => handleAnchor(event, link.anchor)}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.column}>
            <h3 id="footer-official" className={styles.columnTitle}>
              {FOOTER_OFFICIAL.title}
            </h3>
            <ul className={styles.links} aria-labelledby="footer-official">
              {FOOTER_OFFICIAL.links.map((link) => (
                <li key={link.href}>
                  <a className={styles.link} href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                    <svg className={styles.external} viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" />
                    </svg>
                    <span className="visually-hidden"> ({FOOTER_OFFICIAL.hint})</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.column}>
            <h3 className={styles.columnTitle}>{FOOTER_CREDITS.title}</h3>
            <ul className={styles.stack}>
              {FOOTER_CREDITS.stack.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className={styles.type}>{FOOTER_CREDITS.type}</p>
          </div>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>{FOOTER_BOTTOM.copyright}</p>
          <a className={styles.toTop} href="#top" onClick={(event) => handleAnchor(event, 'top')}>
            {FOOTER_BOTTOM.backToTop}
            <svg className={styles.toTopIcon} viewBox="0 0 12 12" aria-hidden="true">
              <path d="M6 9.5V2.5M2.75 5.75 6 2.5l3.25 3.25" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  )
}
