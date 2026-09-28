import gsap from 'gsap'
import { motion } from '@/state/motion'

// Вступление после прелоадера — единственный "постановочный" момент
// страницы, всё остальное движение отвечает на действия пользователя.
// Один таймлайн ведёт и DOM, и 3D:
//  - motion.intro 0 → 1 линейно: сцена сама раскладывает по нему свои
//    задержки и кривые — куски банки всплывают снизу по очереди, лёд
//    влетает из-за краёв на физике, капли проявляются;
//  - шапка опускается сверху, строки заголовка выезжают из масок,
//    карточки проявляются лесенкой, последней — подсказка скролла.
// Элементы помечены data-intro; анимируются внутренние обёртки, а не те
// элементы, которые двигает скролл-сцена, — анимации не спорят за свойства.
export function playIntro(root: HTMLElement, reducedMotion: boolean): gsap.core.Timeline {
  const q = gsap.utils.selector(root)

  if (reducedMotion) {
    // Без движения: сцена сразу в финальной раскладке, контент мягко проявляется
    motion.intro = 1
    return gsap.timeline().from(q('[data-intro]'), { autoAlpha: 0, duration: 0.45, ease: 'power1.out' })
  }

  const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } })
  timeline
    .fromTo(motion, { intro: 0 }, { intro: 1, duration: 3, ease: 'none' }, 0)
    .from(q('[data-intro="header"]'), { y: -18, autoAlpha: 0, duration: 1, stagger: 0.05 }, 0.3)
    .from(q('[data-intro="title-line"]'), { yPercent: 110, duration: 1.25, stagger: 0.09 }, 0.5)
    .from(q('[data-intro="card"]'), { y: 36, autoAlpha: 0, duration: 1.2, stagger: 0.08 }, 0.75)
    .from(q('[data-intro="cue"]'), { y: 10, autoAlpha: 0, duration: 1 }, 1.6)
  return timeline
}
