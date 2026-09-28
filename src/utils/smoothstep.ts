// Плавная ступенька 0 → 1 между from и to (как smoothstep в GLSL). Своя
// функция без three.js: ею пользуются и тайминги скролла (DOM), и сборка
// этикеток в Web Worker, куда three.js не тянем
export function smoothstep(value: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}
