// Где глава со sticky-экраном начинается и сколько длится, px прокрутки.
// Общее для глав, которые начинаются на экран раньше конца предыдущей
// (margin-top: -100svh в CSS): Коллекции, Холода, Состава и финала.
//
// Начало — там, где кончается сцена предыдущей главы (её ScrollTrigger
// считает по высоте окна), а не там, где прилипает sticky-экран этой главы
// (он 100svh). На десктопе это одно и то же. На телефоне со спрятанной
// адресной строкой окно выше 100svh — без этой поправки между главами была
// бы "мёртвая" полоса скролла, где не меняется ничего, а остановки
// сжимались бы.
export function chapterScrollRange(section: HTMLElement, viewport: HTMLElement) {
  const top = section.getBoundingClientRect().top + window.scrollY
  return {
    start: top + viewport.offsetHeight - window.innerHeight,
    distance: section.offsetHeight - viewport.offsetHeight,
  }
}
