// Вкусы главы «Коллекция» (Lineup) — порядок, названия, тексты, цвета и
// развёртки этикеток. Один источник и для DOM (плашка, шкала), и для 3D
// (банки, фон, лёд, подсветка).
//
// Что здесь откуда:
//  - названия, подписи, порядок и цвета придуманы для демо. Где название
//    напечатано на самой банке (Ultra Rosa, Khaotic, Mango Loco, Java Mean
//    Bean), берём его, чтобы сайт не спорил с этикеткой; у двух развёрток
//    без названия — свои демо-имена (Noir, Ultra Baltic);
//  - факты (калории, кофеин, сахар, состав) — только с присланных развёрток
//    D:\этикетки, ничего не досчитано и не выдумано. Где этикетка
//    противоречит сама себе, спорную цифру не показываем:
//      Noir — 100 ккал при 6 г углеводов и 0 г жиров/белков: калории не берём;
//      Ultra Baltic — «ZERO SUGAR» на лицевой стороне и 54 г сахара в таблице:
//      не берём ни сахар, ни калории;
//      Java Mean Bean — кофеин на развёртке 735 px не читается однозначно
//      («20?mg»): вместо него объём банки.
//
// Ultra White — банка первого экрана: её этикетка нарисована процедурно
// (three/can/labelTexture.ts), поэтому label: null. Её цифры — с развёртки
// Ultra 2012 года (та же, по которой рисовалась этикетка).

export interface FlavorFact {
  label: string
  value: string
}

// Цвета вкуса. center/edge/deep — фон сцены (центр, края, самый край),
// word — огромное слово за банкой, accent — акцент интерфейса (свечение
// плашки, отметка на шкале), ice — оттенок толщи льда, rim — цветная
// подсветка банки сбоку, rimIntensity — её сила.
export interface FlavorPalette {
  center: string
  edge: string
  deep: string
  word: string
  accent: string
  ice: string
  rim: string
  rimIntensity: number
}

// Развёртка этикетки (public/labels) и то, как из неё вывести материал —
// см. three/can/label/imageLabel.ts
export interface FlavorLabel {
  src: string
  front: number
  emboss: number
  paintMetal: number
  foil: number
  gold: number
}

export interface Flavor {
  id: string
  name: string
  // Огромное слово за банкой — как ULTRA в финале первого экрана
  word: string
  tagline: string
  facts: FlavorFact[]
  palette: FlavorPalette
  label: FlavorLabel | null
}

// Неразрывные пробелы внутри значения: «150 mg» и «15 fl oz» не рвутся строкой
const nb = (value: string) => value.replaceAll(' ', '\u00a0')

// Порядок — ритм цвета: холодный и тёплый чередуются, а коллекция кончается
// синей Baltic — следующей главе («Холод», глубокий ледяной синий) это
// готовый переход.
export const FLAVORS: Flavor[] = [
  {
    id: 'ultra-white',
    name: 'Ultra White',
    word: 'WHITE',
    tagline: 'Light, crisp citrus. Zero sugar, served ice-cold.',
    facts: [
      { label: 'Calories per can', value: '10' },
      { label: 'Total sugars', value: nb('0 g') },
      { label: 'Caffeine per can', value: nb('140 mg') },
    ],
    // Ровно цвета первого экрана: на стыке глав фон не меняется
    palette: {
      center: '#f5f9fd',
      edge: '#d3e5f1',
      deep: '#b2cfe2',
      word: '#0e2233',
      accent: '#4fb0e3',
      ice: '#d0e9f6',
      rim: '#bfe6ff',
      rimIntensity: 0.5,
    },
    label: null,
  },
  {
    id: 'ultra-rosa',
    name: 'Ultra Rosa',
    word: 'ROSA',
    tagline: 'Light and easy to drink, with a floral finish.',
    facts: [
      { label: 'Calories per can', value: '10' },
      { label: 'Total sugars', value: nb('0 g') },
      { label: 'Caffeine per can', value: nb('150 mg') },
    ],
    palette: {
      center: '#fdf5f7',
      edge: '#f2d3dd',
      deep: '#e2a9bb',
      word: '#5b1030',
      accent: '#e2557f',
      ice: '#f5d9e3',
      rim: '#ff9fc0',
      rimIntensity: 1.1,
    },
    label: { src: 'labels/rosa.webp', front: 0.215, emboss: 0.28, paintMetal: 0.3, foil: 1, gold: 0 },
  },
  {
    id: 'noir',
    name: 'Noir',
    word: 'NOIR',
    tagline: 'The classic green claw, blacked out.',
    facts: [
      { label: 'Total sugars', value: nb('0 g') },
      { label: 'Carbohydrate', value: nb('6 g') },
      { label: 'Caffeine per can', value: nb('140 mg') },
    ],
    palette: {
      center: '#f1f5f0',
      edge: '#d0dfcd',
      deep: '#a9c1a4',
      word: '#0c130d',
      accent: '#6fbf3a',
      ice: '#d8edd1',
      rim: '#a4e36f',
      rimIntensity: 1,
    },
    label: { src: 'labels/noir.webp', front: 0.215, emboss: 0.3, paintMetal: 0.1, foil: 0.6, gold: 0 },
  },
  {
    id: 'khaotic',
    name: 'Khaotic',
    word: 'KHAOTIC',
    tagline: 'Orange, peach and tangerine juice with a full energy kick.',
    facts: [
      { label: 'Fruit juice', value: nb('10 %') },
      { label: 'Energy per 100 ml', value: nb('34 kcal') },
      { label: 'Caffeine per 100 ml', value: nb('32 mg') },
    ],
    // Бирюзовая подсветка на оранжевом — как бирюзовый коготь на оранжевой банке
    palette: {
      center: '#fdf7ef',
      edge: '#f7dcbc',
      deep: '#ecbb84',
      word: '#0d4d57',
      accent: '#f0922b',
      ice: '#d5efec',
      rim: '#5fe0d8',
      rimIntensity: 1.1,
    },
    label: { src: 'labels/khaotic.webp', front: 0.505, emboss: 0.18, paintMetal: 0.12, foil: 0, gold: 0 },
  },
  {
    id: 'mango-loco',
    name: 'Mango Loco',
    word: 'MANGO',
    tagline: 'Mango, guava and passion fruit, loud as a street parade.',
    facts: [
      { label: 'Fruit juice', value: nb('9 %') },
      { label: 'Energy per 100 ml', value: nb('48 kcal') },
      { label: 'Caffeine per 100 ml', value: nb('32 mg') },
    ],
    palette: {
      center: '#f3f9fd',
      edge: '#cde6f5',
      deep: '#9fcbea',
      word: '#0b3d63',
      accent: '#f5b82e',
      ice: '#dcecf5',
      rim: '#ffd35c',
      rimIntensity: 1.25,
    },
    label: { src: 'labels/mango.webp', front: 0.49, emboss: 0.16, paintMetal: 0.12, foil: 0, gold: 0 },
  },
  {
    id: 'java-mean-bean',
    name: 'Java Mean Bean',
    word: 'JAVA',
    tagline: 'Brewed coffee and cream, shaken up with Monster energy.',
    facts: [
      { label: 'Calories per can', value: '220' },
      { label: 'Total sugars', value: nb('35 g') },
      { label: 'Can size', value: nb('15 fl oz') },
    ],
    palette: {
      center: '#faf5ef',
      edge: '#eadac7',
      deep: '#d4b896',
      word: '#3a2212',
      accent: '#c38a2b',
      ice: '#efe4d6',
      rim: '#ffc86b',
      rimIntensity: 1,
    },
    label: { src: 'labels/java.webp', front: 0.337, emboss: 0.22, paintMetal: 0.12, foil: 0.3, gold: 0.9 },
  },
  {
    id: 'ultra-baltic',
    name: 'Ultra Baltic',
    word: 'BALTIC',
    tagline: 'Ice-blue and crisp, cold as a Baltic winter.',
    facts: [
      { label: 'Caffeine per can', value: nb('160 mg') },
      { label: 'Vitamin B12', value: nb('500 % DV') },
      { label: 'Niacin (B3)', value: nb('250 % DV') },
    ],
    palette: {
      center: '#f2f6fd',
      edge: '#c9daf2',
      deep: '#97b6e2',
      word: '#0a2a61',
      accent: '#2f6ed1',
      ice: '#cddff7',
      rim: '#7fb0ff',
      rimIntensity: 1.1,
    },
    label: { src: 'labels/baltic.webp', front: 0.213, emboss: 0.24, paintMetal: 0.35, foil: 1, gold: 0 },
  },
]

// Подписи главы
export const LINEUP_TITLE = 'The lineup'
export const LINEUP_FACTS_TITLE = 'From the label'
// Пометка «демо» — прямо в плашке: цифры честно взяты с банок, остальное — концепт
export const LINEUP_NOTE = 'Concept demo, not affiliated with Monster Energy. Figures are copied from each can’s label.'
