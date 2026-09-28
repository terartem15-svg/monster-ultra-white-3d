import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { Logo } from '@/components/Logo/Logo'
import { useLenis } from '@/hooks/useLenis'
import { HEADER_ACTIONS, NAV_LINKS, type NavLink } from '@/content/site'
import { getActiveSection, hasSectionAnchor, navigateToSection, subscribeActiveSection } from '@/state/navigation'
import styles from './Header.module.css'

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
// подсвечен (aria-current) пункт главы, которая сейчас на экране.
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
    const main = document.getElementById('main')
    document.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    if (main) main.inert = true
    lenis?.stop()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
      if (main) main.inert = false
      lenis?.start()
    }
  }, [menuOpen, lenis])

  const closeMenu = () => setMenuOpen(false)

  // Ссылка на главу: вместо прыжка по якорю — плавный скролл к её началу.
  // Без зарегистрированной главы (About, пока нет футера) ссылка остаётся
  // обычным якорем.
  const handleSectionLink = (event: MouseEvent<HTMLAnchorElement>, link: NavLink) => {
    if (!link.section || !hasSectionAnchor(link.section)) return
    event.preventDefault()
    navigateToSection(link.section, lenis)
  }

  // Из мобильного меню — сначала закрыть панель: пока она открыта, скролл
  // стоит, а контент под ней inert и не примет фокус. Переход — кадром позже,
  // когда эффект меню уже всё вернул.
  const handleMobileLink = (event: MouseEvent<HTMLAnchorElement>, link: NavLink) => {
    closeMenu()
    if (!link.section || !hasSectionAnchor(link.section)) return
    event.preventDefault()
    const section = link.section
    requestAnimationFrame(() => navigateToSection(section, lenis))
  }

  // Логотип ведёт к началу страницы. Если открыто мобильное меню — сначала
  // закрыть его, как у пунктов меню, иначе страница уехала бы под панелью
  const handleBrand = (event: MouseEvent<HTMLAnchorElement>) => {
    if (menuOpen) handleMobileLink(event, HOME_LINK)
    else handleSectionLink(event, HOME_LINK)
  }

  const currentFor = (link: NavLink) => (link.section && link.section === activeSection ? 'true' : undefined)

  return (
    <header className={styles.header}>
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
                onClick={(event) => handleSectionLink(event, link)}
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
          <a className={`${styles.button} ${styles.buttonLight}`} href={HEADER_ACTIONS.store.href}>
            {HEADER_ACTIONS.store.label}
          </a>
        </span>
        <span className={styles.actionSlot} data-intro="header">
          <a className={`${styles.button} ${styles.buttonIce}`} href={HEADER_ACTIONS.join.href}>
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
                  onClick={(event) => handleMobileLink(event, link)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.mobileActions}>
          <a className={`${styles.button} ${styles.buttonLight}`} href={HEADER_ACTIONS.store.href} onClick={closeMenu}>
            {HEADER_ACTIONS.store.label}
          </a>
          <a className={`${styles.button} ${styles.buttonIce}`} href={HEADER_ACTIONS.join.href} onClick={closeMenu}>
            {HEADER_ACTIONS.join.label}
          </a>
        </div>
      </div>
    </header>
  )
}
