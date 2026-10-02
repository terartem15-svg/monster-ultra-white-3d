import { Color, MathUtils } from 'three'
import { LINEUP, PHASES } from '@/animations/scrollPhases'
import { FLAVORS } from '@/content/flavors'
import { INGREDIENTS, INSIDE_SUMMARY } from '@/content/inside'
import { motion } from '@/state/motion'
import { sceneState } from '../sceneState'

// "Вид" сцены в текущем кадре: цвета фона, льда и подсветки и два огромных
// слова за банкой — у каждого вкуса коллекции свои; поверх — «ночь» главы
// «Холод», а за ней — рассвет главы «Состав» с подсветкой в цвет капсулы; на
// финальном экране подсветка снова как у Ultra White в коллекции.
// Считается один раз в начале кадра (из CanRig), читают фон (Backdrop), лёд,
// капли и цветной свет.
//
// Цвета соседних вкусов смешиваются в середине перехода, пока одна банка
// улетает, а другая приходит. Слова не смешиваются, а сменяют друг друга:
// старое гаснет и уезжает влево, новое проявляется справа — два слоя
// (A и B) в шейдере фона. На стыке с первым экраном в слое A — ULTRA из
// финала Hero, в слое B — слово первого вкуса.

interface PaletteColors {
  center: Color
  edge: Color
  deep: Color
  word: Color
  glow: Color
  ice: Color
  rim: Color
  rimIntensity: number
}

const WHITE = new Color('#ffffff')

// Свечение за банкой: у Ultra White — чисто белое (как было на первом
// экране), у остальных — белое с лёгким оттенком акцента
const PALETTES: PaletteColors[] = FLAVORS.map(({ palette }, index) => ({
  center: new Color(palette.center),
  edge: new Color(palette.edge),
  deep: new Color(palette.deep),
  word: new Color(palette.word),
  glow: WHITE.clone().lerp(new Color(palette.accent), index === 0 ? 0 : 0.22),
  ice: new Color(palette.ice),
  rim: new Color(palette.rim),
  rimIntensity: palette.rimIntensity,
}))

// «Ночь» главы «Холод» — ложится поверх цвета вкуса по sceneState.dark.
// Глубокий ледяной синий (--c-night в tokens.css) по краям, в центре —
// холодное сияние за банкой. Подсветка сбоку — ледяная и сильнее: на тёмном
// фоне она обводит банку светлым контуром
const NIGHT = {
  center: new Color('#0e2a49'),
  edge: new Color('#081a31'),
  deep: new Color('#030a15'),
  glow: new Color('#2d6399'),
  ice: new Color('#bcdcf6'),
  rim: new Color('#9ad6ff'),
  rimIntensity: 1.8,
}

// «Состав»: фон возвращается к ледяному свету первого экрана (та же палитра,
// что у Ultra White), а подсветка сбоку и сияние за банкой берут цвет
// капсулы текущего ингредиента — у каждой остановки свой холодный оттенок
const INSIDE_ACCENTS = [...INGREDIENTS.map((ingredient) => new Color(ingredient.color)), new Color(INSIDE_SUMMARY.color)]
const INSIDE_RIM_INTENSITY = 0.9
// Сколько цвета капсулы в сиянии за банкой и в краях фона
const INSIDE_GLOW_TINT = 0.16
const INSIDE_EDGE_TINT = 0.1

// Капли воды — чуть светлее льда. Их цвет — базовый цвет капель первого
// экрана, окрашенный так же, как лёд относительно его базового цвета: у
// Ultra White капли остаются ровно такими, какими были
const DROPLET_BASE = new Color('#d4eefb')
const ICE_BASE = PALETTES[0].ice

// Слова за банкой: 0 — ULTRA из финала первого экрана, k + 1 — слово вкуса k
export const WORD_ULTRA = 0
export const wordIndexOf = (flavor: number) => flavor + 1

export interface WordLayer {
  index: number
  opacity: number
  // Сдвиг по горизонтали, доля ширины экрана
  shift: number
  color: Color
}

export const lineupLook = {
  center: new Color(),
  edge: new Color(),
  deep: new Color(),
  glow: new Color(),
  ice: new Color(),
  droplet: new Color(),
  rim: new Color(),
  rimIntensity: 0,
  words: [
    { index: WORD_ULTRA, opacity: 0, shift: 0, color: new Color() },
    { index: wordIndexOf(0), opacity: 0, shift: 0, color: new Color() },
  ] as [WordLayer, WordLayer],
}

// Насколько далеко уезжает слово при смене, доля ширины экрана
const WORD_TRAVEL = 0.06
// Свет подсветки разгорается в первой половине стыка
const RIM_IN: [number, number] = [0.1, 0.7]

const smooth = (value: number, [from, to]: readonly [number, number]) => MathUtils.smoothstep(value, from, to)

// Временные цвета кадра
const accent = new Color()
const tinted = new Color()

function setWord(layer: WordLayer, index: number, opacity: number, shift: number, color: Color) {
  layer.index = index
  layer.opacity = opacity
  layer.shift = motion.reducedMotion ? 0 : shift
  layer.color.copy(color)
}

export function updateLineupLook() {
  const count = FLAVORS.length
  const enter = sceneState.lineupEnter
  const look = Math.min(count - 1, Math.max(0, sceneState.flavorLook))
  const from = Math.min(Math.max(0, count - 2), Math.floor(look))
  const to = Math.min(count - 1, from + 1)
  const t = MathUtils.smoothstep(look - from, 0.2, 0.8)
  const a = PALETTES[from]
  const b = PALETTES[to]

  // «Состав»: цвет текущей капсулы (между остановками — смесь соседних) и
  // насколько наступил рассвет — к нему цвет вкуса уступает место свету главы
  const dawn = sceneState.dawn
  const stop = Math.min(INSIDE_ACCENTS.length - 1, Math.max(0, sceneState.ingredientLook))
  const stopFrom = Math.min(INSIDE_ACCENTS.length - 2, Math.floor(stop))
  accent.lerpColors(INSIDE_ACCENTS[stopFrom], INSIDE_ACCENTS[stopFrom + 1], MathUtils.smoothstep(stop - stopFrom, 0.2, 0.8))
  const day = PALETTES[0]
  // Финальный экран: цвет капсулы уходит — подсветка, края фона и сияние
  // снова как у Ultra White, банки первого экрана и коллекции
  const finale = sceneState.finalLook
  accent.lerp(day.rim, finale)
  const edgeTint = INSIDE_EDGE_TINT * (1 - finale)
  const glowTint = INSIDE_GLOW_TINT * (1 - finale)
  const dawnRim = MathUtils.lerp(INSIDE_RIM_INTENSITY, day.rimIntensity, finale)

  // «Ночь» главы «Холод» — поверх цвета вкуса. Фон темнеет через оттенок и
  // насыщенность (HSL), а не прямой смесью: прямая смесь светло-голубого с
  // тёмно-синим проходит через серый, а так сумерки остаются синими. Рассвет
  // идёт тем же путём обратно: dark уже учитывает его (CanRig.tsx)
  const dark = sceneState.dark
  lineupLook.center.lerpColors(a.center, b.center, t).lerp(day.center, dawn).lerpHSL(NIGHT.center, dark)
  lineupLook.edge.lerpColors(a.edge, b.edge, t).lerp(tinted.copy(day.edge).lerp(accent, edgeTint), dawn).lerpHSL(NIGHT.edge, dark)
  lineupLook.deep.lerpColors(a.deep, b.deep, t).lerp(day.deep, dawn).lerpHSL(NIGHT.deep, dark)
  lineupLook.glow.lerpColors(a.glow, b.glow, t).lerp(tinted.copy(WHITE).lerp(accent, glowTint), dawn).lerpHSL(NIGHT.glow, dark)
  lineupLook.ice.lerpColors(a.ice, b.ice, t).lerp(day.ice, dawn).lerp(NIGHT.ice, dark)
  lineupLook.droplet.setRGB(
    (DROPLET_BASE.r * lineupLook.ice.r) / ICE_BASE.r,
    (DROPLET_BASE.g * lineupLook.ice.g) / ICE_BASE.g,
    (DROPLET_BASE.b * lineupLook.ice.b) / ICE_BASE.b,
  )
  lineupLook.rim.lerpColors(a.rim, b.rim, t).lerp(accent, dawn).lerp(NIGHT.rim, dark)
  // На первом экране цветного света нет вовсе — он появляется со стыком
  const rimIntensity = MathUtils.lerp(a.rimIntensity, b.rimIntensity, t) * smooth(enter, RIM_IN)
  lineupLook.rimIntensity = MathUtils.lerp(MathUtils.lerp(rimIntensity, dawnRim, dawn), NIGHT.rimIntensity, dark)

  const [layerA, layerB] = lineupLook.words
  if (enter < 1) {
    // Стык: ULTRA из финала Hero уходит, слово первого вкуса приходит
    const heroWord = smooth(sceneState.scroll, PHASES.word)
    const out = smooth(enter, LINEUP.handoff.heroWordOut)
    const into = smooth(enter, LINEUP.handoff.wordIn)
    setWord(layerA, WORD_ULTRA, heroWord * (1 - out), -out * WORD_TRAVEL, PALETTES[0].word)
    setWord(layerB, wordIndexOf(0), into, (1 - into) * WORD_TRAVEL, PALETTES[0].word)
  } else {
    // Коллекция: слово текущей банки сменяется словом следующей
    const step = look - from
    const out = MathUtils.smoothstep(step, 0.05, 0.45)
    const into = MathUtils.smoothstep(step, 0.55, 0.95)
    setWord(layerA, wordIndexOf(from), 1 - out, -out * WORD_TRAVEL, a.word)
    setWord(layerB, wordIndexOf(to), to === from ? 0 : into, (1 - into) * WORD_TRAVEL, b.word)
  }

  // В «Холоде» слов за банкой нет: сцену держат сама банка и темнота. После
  // него слова вкусов не возвращаются (night остаётся 1 и на рассвете)
  layerA.opacity *= 1 - sceneState.night
  layerB.opacity *= 1 - sceneState.night
}
