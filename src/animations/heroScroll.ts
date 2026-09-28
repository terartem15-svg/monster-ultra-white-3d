import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from '@/state/motion'
import { PHASES } from './scrollPhases'

gsap.registerPlugin(ScrollTrigger)

// Скролл-сцена первого экрана. Пока sticky-экран держится на месте,
// прогресс скролла 0..1:
//  - пишется в motion.scroll — по нему 3D-сцена собирает банку, делает ей
//    оборот, подлетает к деталям с выносками и ставит финал (three/CanRig.tsx,
//    three/CalloutTracker.tsx, three/Backdrop.tsx);
//  - двигает DOM: карточки и заголовок разъезжаются к краям и гаснут,
//    подсказка скролла исчезает сразу, в финале появляется подпись.
// Таймлайн нормирован на длительность 1 — позиции в нём равны долям скролла,
// а сами доли общие для DOM и 3D (animations/scrollPhases.ts).
export function createHeroScroll(section: HTMLElement): () => void {
  const media = gsap.matchMedia()

  const select = (selector: string) => Array.from(section.querySelectorAll<HTMLElement>(selector))
  const cue = select('[data-hero-cue]')
  const outro = select('[data-hero-outro]')
  const outroExit = select('[data-hero-outro-exit]')
  const title = select('[data-hero-title]')
  const leftCards = select('[data-hero-card="left"]')
  const rightCards = select('[data-hero-card="right"]')

  const scrollTrigger = {
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    // Lenis уже сглаживает скролл — второй слой сглаживания дал бы "вату"
    scrub: true,
    onUpdate: (self: ScrollTrigger) => {
      motion.scroll = self.progress
    },
  }

  const [contentFrom, contentTo] = PHASES.contentOut
  const contentDuration = contentTo - contentFrom
  const [captionFrom, captionTo] = PHASES.caption

  const addOutro = (timeline: gsap.core.Timeline) => {
    timeline
      .to(cue, { autoAlpha: 0, duration: 0.03 }, 0)
      .fromTo(
        outro,
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: captionTo - captionFrom, ease: 'power2.out' },
        captionFrom,
      )
      // Пустой шаг в конце: таймлайн ровно 0..1 при любом наборе анимаций
      .set({}, {}, 1)
  }

  // Десктоп: колонки разъезжаются в стороны, освобождая место банке
  media.add('(min-width: 1000px)', () => {
    const timeline = gsap.timeline({ defaults: { ease: 'power1.in' }, scrollTrigger })
    timeline
      .to(leftCards, { x: '-6vw', autoAlpha: 0, duration: contentDuration * 0.85, stagger: contentDuration * 0.15 }, contentFrom)
      .to(
        [...title, ...rightCards],
        { x: '6vw', autoAlpha: 0, duration: contentDuration * 0.8, stagger: contentDuration * 0.1 },
        contentFrom,
      )
    addOutro(timeline)
  })

  // Планшет и телефон: заголовок уходит вверх, карточки — вниз
  media.add('(max-width: 999px)', () => {
    const timeline = gsap.timeline({ defaults: { ease: 'power1.in' }, scrollTrigger })
    timeline
      .to(title, { y: '-4vh', autoAlpha: 0, duration: contentDuration * 0.8 }, contentFrom)
      .to(
        [...leftCards, ...rightCards],
        { y: '6vh', autoAlpha: 0, duration: contentDuration * 0.8, stagger: contentDuration * 0.06 },
        contentFrom + 0.01,
      )
    addOutro(timeline)
  })

  // Стык со следующей главой: когда первый экран отлипает и уезжает вверх,
  // подпись финала гаснет за первую четверть экрана — иначе она проплыла бы
  // поверх банки, которая остаётся на месте и становится первой в коллекции.
  // Отдельный триггер: он живёт уже после конца скролл-сцены.
  const exit = gsap.fromTo(
    outroExit,
    { autoAlpha: 1 },
    {
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'bottom bottom', end: 'bottom 75%', scrub: true },
    },
  )

  return () => {
    media.revert()
    exit.scrollTrigger?.kill()
    exit.kill()
    motion.scroll = 0
  }
}
