// Детерминированный генератор случайных чисел (mulberry32). Вся "случайная"
// геометрия и раскладка — грани кристалла, узор инея, орбиты капель —
// строится от фиксированного зерна: при каждой загрузке и в каждом браузере
// картинка одинаковая, а не пересобирается по-новому на каждый рефреш.
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Число в диапазоне [min, max) от переданного генератора
export function randomRange(random: () => number, min: number, max: number): number {
  return min + (max - min) * random()
}
