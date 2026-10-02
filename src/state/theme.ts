// Тема «хрома» поверх сцены — шапки и курсора. Глава «Холод» и футер —
// тёмные: пока фон под шапкой тёмный, шапка и курсор переходят на светлые
// цвета. Тема — атрибут data-theme на <html>, стили — в модулях шапки,
// логотипа и курсора; сами главы свою тему знают и так. Заодно меняется
// цвет интерфейса браузера на телефоне (meta theme-color).
//
// Ночь наступает в «Холоде» и кончается в следующей главе, «Составе»: каждая
// глава сообщает только своё («стемнело», «рассвело», «под шапкой футер»), а
// тема выводится из всех флагов. Так порядок, в котором главы обновляются
// при прыжке через всю страницу, не важен — флаг каждой главы верен сам по себе.
//
// Тема меняется редко (на границе главы), поэтому это не поле в motion, а
// простые функции с запоминанием: DOM трогается только при смене.

export type PageTheme = 'light' | 'dark'

// Цвета строки браузера — как фон под шапкой в каждой теме (tokens.css)
const THEME_COLOR: Record<PageTheme, string> = {
  light: '#eef5fb',
  dark: '#0c2644',
}

let current: PageTheme = 'light'
const flags = { night: false, dawn: false, footer: false }

function apply() {
  const theme: PageTheme = (flags.night && !flags.dawn) || flags.footer ? 'dark' : 'light'
  if (theme === current) return
  current = theme
  const root = document.documentElement
  if (theme === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

// «Холод»: фон под шапкой стемнел
export function setNight(on: boolean) {
  flags.night = on
  apply()
}

// «Состав»: фон под шапкой снова светлый
export function setDawn(on: boolean) {
  flags.dawn = on
  apply()
}

// Футер: под шапкой его тёмный фон. Заодно тёмный фон страницы — его видно,
// когда телефон «оттягивает» прокрутку за конец страницы (global.css)
export function setFooterTheme(on: boolean) {
  if (flags.footer === on) return
  flags.footer = on
  if (on) document.documentElement.dataset.footer = ''
  else delete document.documentElement.dataset.footer
  apply()
}
