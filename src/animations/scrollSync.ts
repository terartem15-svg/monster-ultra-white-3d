import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

// Связывает Lenis (плавный инерционный скролл) и GSAP ScrollTrigger в один
// источник правды по прогрессу скролла. Без этой связки ScrollTrigger следит
// за нативным скроллом браузера, а Lenis его подменяет своим — триггеры
// начинают "дёргаться" и расходиться с реальной позицией контента.
// Рецепт официальный (Lenis + GSAP): ScrollTrigger обновляется на событие
// скролла от Lenis, а Lenis, в свою очередь, тикает от того же GSAP-тикера.
export function syncLenisWithScrollTrigger(lenis: Lenis): () => void {
  const onScroll = () => ScrollTrigger.update()
  lenis.on('scroll', onScroll)

  const onTick = (time: number) => {
    lenis.raf(time * 1000)
  }
  gsap.ticker.add(onTick)
  gsap.ticker.lagSmoothing(0)

  return () => {
    lenis.off('scroll', onScroll)
    gsap.ticker.remove(onTick)
  }
}
