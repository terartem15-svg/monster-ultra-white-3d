import type { AnchorId } from '@/state/navigation'

// Тексты футера. Футер — последняя «глава» и честная подпись под всей
// страницей: что это за сайт (блок About, к нему ведёт пункт меню), заметная
// пометка, что это демо без связи с Monster Energy, переходы по главам и
// ссылки на настоящий бренд. Голос — как во всех главах: сухо, без «мы».

export const FOOTER_ABOUT = {
  eyebrow: 'About this page',
  title: 'A concept, served ice-cold.',
  text: [
    'A portfolio piece: a concept landing page for Monster Ultra White, built as one WebGL scene that follows a single can from the first screen to the frost.',
    'Flavor notes, chapter texts, the store list and the sign-up form are made up for the demo. Product facts are copied from photographed can labels and may differ from the cans where you live.',
  ],
}

// Пометка о демо — крупно, отдельной полосой: бренд настоящий, а сайт — нет
export const FOOTER_NOTICE = {
  badge: 'Concept demo',
  text: 'Not an official Monster Energy website. This page is not affiliated with, endorsed or sponsored by Monster Energy Company. Monster, Monster Energy, Ultra and the claw logo are trademarks of their respective owners.',
}

export interface FooterChapterLink {
  label: string
  href: string
  anchor: AnchorId
}

// Переходы по главам — названия те же, что у самих глав на экране
export const FOOTER_CHAPTERS = {
  title: 'On this page',
  links: [
    { label: 'Home', href: '#top', anchor: 'top' },
    { label: 'The lineup', href: '#lineup', anchor: 'lineup' },
    { label: 'Cooling down', href: '#cold', anchor: 'cold' },
    { label: 'What’s inside', href: '#inside', anchor: 'inside' },
    { label: 'Stay frosty', href: '#final', anchor: 'final' },
  ] satisfies FooterChapterLink[],
}

export interface FooterExternalLink {
  label: string
  href: string
}

// Соцсети и сайт — настоящие, бренда: за настоящим Monster — туда. Ссылки
// открываются в новой вкладке, скринридер слышит это из подписи ссылки
export const FOOTER_OFFICIAL = {
  title: 'Real Monster',
  hint: 'official Monster Energy, opens in a new tab',
  links: [
    { label: 'monsterenergy.com', href: 'https://www.monsterenergy.com/' },
    { label: 'Instagram', href: 'https://www.instagram.com/monsterenergy/' },
    { label: 'YouTube', href: 'https://www.youtube.com/@MonsterEnergy' },
    { label: 'X', href: 'https://x.com/MonsterEnergy' },
    { label: 'TikTok', href: 'https://www.tiktok.com/@monsterenergy' },
  ] satisfies FooterExternalLink[],
}

// Из чего собрано — для портфолио это и есть «о нас»
export const FOOTER_CREDITS = {
  title: 'Built with',
  stack: ['React', 'three.js', 'GSAP', 'Lenis', 'cannon-es'],
  type: 'Type: Nunito, Archivo, Mansalva and Rubik Dirt (SIL Open Font License).',
}

export const FOOTER_BOTTOM = {
  // Год — момент сборки страницы, не «текущий» в браузере: подпись не
  // меняется сама по себе
  copyright: '© 2026 · A portfolio concept',
  backToTop: 'Back to top',
}
