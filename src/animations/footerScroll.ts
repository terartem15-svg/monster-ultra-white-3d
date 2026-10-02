import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { setActiveSection } from '@/state/navigation'
import { setSceneCovered } from '@/state/sceneCover'
import { setFooterTheme } from '@/state/theme'
import { keepChapterPosition, type ChapterSnapshot } from './chapterRestore'

gsap.registerPlugin(ScrollTrigger)

// Футер наезжает на финальный экран снизу. Сам наезд делает CSS: холст сцены
// и экран финала прилипают внутри общего контейнера и уезжают вверх вместе
// (App.module.css, three/Scene.module.css). Здесь — то, что зависит от того,
// сколько футера на экране:
//  - шапка переходит на светлый текст, когда под ней тёмный футер;
//  - в меню подсвечивается About, когда футер занял больше половины экрана;
//  - когда футер закрыл окно целиком, сцена перестаёт рисовать кадры
//    (state/sceneCover.ts);
//  - после поворота телефона или смены размера окна страница возвращается
//    на то же место футера (длина глав над ним при этом меняется);
//  - огромный коготь поднимается навстречу (параллакс, не при «уменьшить
//    движение»).

interface FooterScrollOptions {
  // Пустой блок высотой 100svh в начале футера: столько же, сколько у
  // sticky-экрана финала, — на этом пути экран финала уезжает за верх окна
  probe: HTMLElement
  claw: HTMLElement
}

// Где по высоте середина шапки, px от верха окна: тёмная тема — когда до неё
// дошёл верх футера
function headerLine(): number {
  return (document.querySelector('header')?.offsetHeight ?? 0) / 2
}

export function createFooterScroll(footer: HTMLElement, { probe, claw }: FooterScrollOptions): () => void {
  const media = gsap.matchMedia()
  // Мерки — при каждом пересчёте ScrollTrigger, а не на каждый скролл
  const size = { top: 0, height: 0, screen: 0 }
  const measure = () => {
    size.top = footer.getBoundingClientRect().top + window.scrollY
    size.height = footer.offsetHeight
    size.screen = probe.offsetHeight
  }
  measure()

  // Где страница относительно футера — для возврата после смены размера.
  // progress у футера — только «на экране или нет» (на краях главы
  // chapterRestore не возвращает); enter — смещение от верха футера: выше
  // него — в долях экрана (финал уезжает), ниже — в долях высоты футера
  const last: ChapterSnapshot = { progress: 0, enter: 0, raw: 0 }

  const update = (scroll: number) => {
    const offset = scroll - size.top
    // Путь от «экран финала начал уезжать» до «футер у верха окна», 0..1.
    // На 1 футер закрывает окно целиком: его высота не меньше окна
    const shown = Math.min(1, Math.max(0, (offset + size.screen) / Math.max(1, size.screen)))
    setFooterTheme(shown > 0 && size.screen * (1 - shown) <= headerLine())
    // Выше футера меню не трогаем — там командуют главы
    if (shown > 0) setActiveSection(shown > 0.5 ? 'about' : 'final')
    setSceneCovered(shown >= 1)
    last.progress = shown > 0 ? 0.5 : 0
    last.enter = offset < 0 ? offset / Math.max(1, size.screen) : offset / Math.max(1, size.height)
  }

  // Идёт ли пересчёт ScrollTrigger: от refreshInit до refresh он сбрасывает
  // триггер в начало и прогоняет главы через прежнюю прокрутку в новой
  // раскладке — тема и пункт меню по этим промежуточным положениям не
  // меняются (как решения об инее в finalScroll.ts)
  let refreshing = false

  // От начала наезда до конца страницы: в глубине футера тоже нужно знать,
  // где страница, — для возврата на место
  const trigger = ScrollTrigger.create({
    trigger: footer,
    start: () => {
      measure()
      return size.top - size.screen
    },
    end: 'max',
    onUpdate: (self) => {
      if (!refreshing) update(self.scroll())
    },
  })

  const onRefreshInit = () => {
    refreshing = true
  }
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit)

  const stopKeeping = keepChapterPosition(last, ({ enter }) => {
    measure()
    const target = size.top + enter * (enter < 0 ? size.screen : size.height)
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
  })

  // После пересчёта (и после возврата на место — его обработчик выше по
  // списку) состояние футера — по настоящей прокрутке: сам триггер после
  // пересчёта может и не позвать onUpdate, если его прогресс «не изменился»
  const onRefresh = () => {
    refreshing = false
    measure()
    update(window.scrollY)
  }
  ScrollTrigger.addEventListener('refresh', onRefresh)

  // Коготь всплывает из-под нижнего края, пока футер выезжает на экран
  media.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.fromTo(
      claw,
      { yPercent: 14 },
      {
        yPercent: 0,
        ease: 'none',
        scrollTrigger: { trigger: footer, start: 'top bottom', end: 'top top', scrub: true },
      },
    )
  })

  return () => {
    stopKeeping()
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit)
    ScrollTrigger.removeEventListener('refresh', onRefresh)
    trigger.kill()
    media.revert()
    setFooterTheme(false)
    setSceneCovered(false)
  }
}
