import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { Logo } from '@/components/Logo/Logo'
import { useLenis } from '@/hooks/useLenis'
import { HEADER_ACTIONS, NAV_LINKS, type NavLink } from '@/content/site'
import {
  getActiveSection,
  hasSectionAnchor,
  navigateToSection,
  subscribeActiveSection,
  type AnchorId,
} from '@/state/navigation'
import styles from './Header.module.css'

// Ширина, на которой меню и кнопки уходят в панель за кнопкой Menu, — та же,
// что в Header.module.css
const MENU_QUERY = '(max-width: 999px)'

// Логотип ведёт туда же, куда пункт главы "top" (Home), где бы тот ни стоял в
// меню — ищем по главе, а не по позиции в списке
const HOME_LINK: NavLink = NAV_LINKS.find((link) => link.section === 'top') ?? { label: 'Home', href: '#top', section: 'top' }

// Шапка по раскладке референса: логотип слева, меню-пилюли (Home активна),
// справа две кнопки. На узких экранах меню и кнопки прячутся в
// полноэкранную панель за кнопкой Menu.
//
// data-intro — метки для вступительной анимации (animations/intro.ts):
// элементы шапки мягко опускаются сверху друг за другом.
//
// Пункты меню ведут к главам плавным скроллом (state/navigation.ts), а
// подсвечен (aria-current) пункт главы, которая сейчас на экране. Кнопки
// справа ведут к демо-панелям финального экрана (sections/Final).
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const lenis = useLenis()
  const activeSection = useSyncExternalStore(subscribeActiveSection, getActiveSection, () => 'top' as const)

  // Открытое меню: фокус на первую ссылку, Escape закрывает и возвращает
  // фокус на кнопку. Контент под панелью выключен (inert) — Tab не уходит
  // под меню, — и скролл стоит: и нативный, и инерционный Lenis.
  useEffect(() => {
    if (!menuOpen) return
    firstLinkRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    // Под панелью — главы и футер
    const content = [document.getElementById('main'), document.getElementById('site-footer')]
    document.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    for (const element of content) if (element) element.inert = true
    lenis?.stop()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
      for (const element of content) if (element) element.inert = false
      lenis?.start()
    }
  }, [menuOpen, lenis])

  // Окно стало шире панели (повернули планшет, растянули окно) — меню
  // закрывается. Иначе панель осталась бы поверх страницы без кнопки Close
  // (на широком экране её прячет CSS), со стоящим скроллом и inert-контентом.
  useEffect(() => {
    const media = window.matchMedia(MENU_QUERY)
    const onChange = () => {
      if (!media.matches) setMenuOpen(false)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const closeMenu = () => setMenuOpen(false)

  // Ссылка на главу, демо-панель или футер: вместо прыжка по якорю —
  // плавный скролл к её началу. Без зарегистрированной точки ссылка остаётся
  // обычным якорем.
  const handleAnchor = (event: MouseEvent<HTMLAnchorElement>, id: AnchorId | undefined) => {
    if (!id || !hasSectionAnchor(id)) return
    event.preventDefault()
    navigateToSection(id, lenis)
  }

  // Из мобильного меню — сначала закрыть панель: пока она открыта, скролл
  // стоит, а контент под ней inert и не примет фокус. Переход — кадром позже,
  // когда эффект меню уже всё вернул.
  const handleMobileAnchor = (event: MouseEvent<HTMLAnchorElement>, id: AnchorId | undefined) => {
    closeMenu()
    if (!id || !hasSectionAnchor(id)) return
    event.preventDefault()
    requestAnimationFrame(() => navigateToSection(id, lenis))
  }

  // Логотип ведёт к началу страницы. Если открыто мобильное меню — сначала
  // закрыть его, как у пунктов меню, иначе страница уехала бы под панелью
  const handleBrand = (event: MouseEvent<HTMLAnchorElement>) => {
    if (menuOpen) handleMobileAnchor(event, HOME_LINK.section)
    else handleAnchor(event, HOME_LINK.section)
  }

  const currentFor = (link: NavLink) => (link.section && link.section === activeSection ? 'true' : undefined)

  return (
    // data-menu-open — для темы: над светлой панелью меню логотип остаётся
    // тёмным и в тёмной главе (Header.module.css)
    <header className={styles.header} data-menu-open={menuOpen}>
      <a
        className={styles.brand}
        href="#top"
        aria-label="Monster Ultra White, home"
        translate="no"
        data-intro="header"
        onClick={handleBrand}
      >
        <Logo />
      </a>

      <nav className={styles.nav} aria-label="Main">
        <ul className={styles.navList}>
          {NAV_LINKS.map((link) => (
            <li key={link.label} data-intro="header">
              <a
                className={styles.navLink}
                href={link.href}
                aria-current={currentFor(link)}
                onClick={(event) => handleAnchor(event, link.section)}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Метки вступления стоят на обёртках, а не на самих кнопках: у кнопок
          свой CSS-transition на transform (отклик на нажатие), и GSAP с ним
          конфликтует — финальная позиция "застревает" */}
      <div className={styles.actions}>
        <span className={styles.actionSlot} data-intro="header">
          <a
            className={`${styles.button} ${styles.buttonLight}`}
            href={HEADER_ACTIONS.store.href}
            onClick={(event) => handleAnchor(event, HEADER_ACTIONS.store.panel)}
          >
            {HEADER_ACTIONS.store.label}
          </a>
        </span>
        <span className={styles.actionSlot} data-intro="header">
          <a
            className={`${styles.button} ${styles.buttonIce}`}
            href={HEADER_ACTIONS.join.href}
            onClick={(event) => handleAnchor(event, HEADER_ACTIONS.join.panel)}
          >
            {HEADER_ACTIONS.join.label}
          </a>
        </span>
      </div>

      <div className={styles.menuSlot} data-intro="header">
        <button
          ref={menuButtonRef}
          className={styles.menuButton}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className={styles.menuIcon} aria-hidden="true" />
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>

      <div id="mobile-menu" className={styles.mobileMenu} data-open={menuOpen} hidden={!menuOpen}>
        <nav aria-label="Mobile">
          <ul className={styles.mobileList}>
            {NAV_LINKS.map((link, index) => (
              <li key={link.label}>
                <a
                  ref={index === 0 ? firstLinkRef : undefined}
                  className={styles.mobileLink}
                  href={link.href}
                  aria-current={currentFor(link)}
                  onClick={(event) => handleMobileAnchor(event, link.section)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.mobileActions}>
          <a
            className={`${styles.button} ${styles.buttonLight}`}
            href={HEADER_ACTIONS.store.href}
            onClick={(event) => handleMobileAnchor(event, HEADER_ACTIONS.store.panel)}
          >
            {HEADER_ACTIONS.store.label}
          </a>
          <a
            className={`${styles.button} ${styles.buttonIce}`}
            href={HEADER_ACTIONS.join.href}
            onClick={(event) => handleMobileAnchor(event, HEADER_ACTIONS.join.panel)}
          >
            {HEADER_ACTIONS.join.label}
          </a>
        </div>
      </div>
    </header>
  )
}
