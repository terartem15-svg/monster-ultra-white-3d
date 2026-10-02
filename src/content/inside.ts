// Тексты и данные главы «Состав» (What's inside): пять капсул-ингредиентов,
// итоговая остановка с полным списком и подписи. Один источник и для DOM
// (плашка, метки), и для 3D (цвета капсул, порядок выхода из банки).
//
// Что здесь откуда:
//  - факты — только с развёртки банки (D:\этикетки\этикетка2.jpg, Monster
//    Energy Zero Ultra, © 2012): список INGREDIENTS дословно и в том же
//    порядке, рамка «Monster Energy Blend», «Caffeine from all sources:
//    140mg per can» и проценты витаминов из таблицы Nutrition Facts. Место
//    ингредиента в списке не вписано руками, а считается из самого списка;
//  - чего на этикетке нет (миллиграммы таурина, карнитина, женьшеня), того
//    нет и здесь. Женьшень на этой банке — «Panax ginseng flavor», так и пишем;
//  - подписи к ингредиентам написаны для демо: они пересказывают этикетку и
//    ничего не обещают о действии напитка. Голос — без «мы», как во всех главах;
//  - цвета капсул придуманы: у каждой свой холодный оттенок.

export interface InsideFact {
  label: string
  value: string
}

export interface Ingredient {
  id: string
  name: string
  text: string
  // Строки таблицы «From the label»
  facts: InsideFact[]
  // Цвет капсулы: наполнение, оно же акцент плашки и метки
  color: string
}

// Неразрывные пробелы внутри значения: «140 mg» и «250 % DV» не рвутся строкой
const nb = (value: string) => value.replaceAll(' ', '\u00a0')

// Список INGREDIENTS с этикетки — дословно и в том же порядке. По правилам
// маркировки он идёт по убыванию доли в напитке
export const INGREDIENT_LIST = [
  'carbonated water',
  'citric acid',
  'erythritol',
  'taurine',
  'sodium citrate',
  'natural & artificial flavors',
  'Panax ginseng flavor',
  'L-carnitine L-tartrate',
  'caffeine',
  'sucralose',
  'sorbic acid (preservative)',
  'benzoic acid (preservative)',
  'niacinamide (vit. B3)',
  'D-calcium pantothenate (vit. B5)',
  'acesulfame potassium',
  'inositol',
  'pyridoxine hydrochloride (vit. B6)',
  'cyanocobalamin (vit. B12)',
]

// Рамка «MONSTER ENERGY BLEND» с той же этикетки, в её порядке
const ENERGY_BLEND = ['taurine', 'L-carnitine', 'caffeine', 'inositol']

const ORDINALS = ['1st', '2nd', '3rd', '4th']

// Надписи по кругу под горлышком банки: ZERO SUGAR, TAURINE, GINSENG
const RIM = nb('Under the rim')

// «No. 4 of 18» — место в списке ингредиентов (entry — как на этикетке)
function listPlace(entry: string): string {
  const place = INGREDIENT_LIST.indexOf(entry) + 1
  if (place === 0) throw new Error(`"${entry}" is not on the ingredient list`)
  return nb(`No. ${place} of ${INGREDIENT_LIST.length}`)
}

// «1st of 4» — место в рамке Monster Energy Blend
function blendPlace(entry: string): string {
  const index = ENERGY_BLEND.indexOf(entry)
  if (index === -1) throw new Error(`"${entry}" is not in the energy blend`)
  return nb(`${ORDINALS[index]} of ${ENERGY_BLEND.length}`)
}

// Порядок — как на этикетке: капсулы выходят из банки в том же порядке, в
// каком ингредиенты стоят в списке
export const INGREDIENTS: Ingredient[] = [
  {
    id: 'taurine',
    name: 'Taurine',
    text: `First in the Monster Energy Blend: ${ENERGY_BLEND.slice(0, -1).join(', ')} and ${ENERGY_BLEND.at(-1)}.`,
    facts: [
      { label: 'Monster Energy Blend', value: blendPlace('taurine') },
      { label: 'Ingredient list', value: listPlace('taurine') },
      { label: 'On the can', value: RIM },
    ],
    color: '#38a5e6',
  },
  {
    id: 'ginseng',
    name: 'Panax ginseng',
    text: 'Not part of the Monster Energy Blend. On this can’s ingredient list it appears as a flavor.',
    facts: [
      { label: 'Listed as', value: 'Panax ginseng flavor' },
      { label: 'Ingredient list', value: listPlace('Panax ginseng flavor') },
      { label: 'On the can', value: RIM },
    ],
    color: '#2fc7ae',
  },
  {
    id: 'l-carnitine',
    name: 'L-carnitine',
    text: 'Second in the blend. The ingredient list gives its full chemical name.',
    facts: [
      { label: 'Listed as', value: 'L-carnitine L-tartrate' },
      { label: 'Monster Energy Blend', value: blendPlace('L-carnitine') },
      { label: 'Ingredient list', value: listPlace('L-carnitine L-tartrate') },
    ],
    color: '#8890f4',
  },
  {
    id: 'caffeine',
    name: 'Caffeine',
    text: 'The only part of the blend with an amount on the label, counted from all sources.',
    facts: [
      { label: 'Caffeine per can', value: nb('140 mg') },
      { label: 'Monster Energy Blend', value: blendPlace('caffeine') },
      { label: 'Ingredient list', value: listPlace('caffeine') },
    ],
    color: '#2a63dc',
  },
  {
    id: 'b-vitamins',
    name: 'B-vitamins',
    text: 'Four of them, each a multiple of the daily value in a single can.',
    facts: [
      { label: 'Niacin (B3)', value: nb('250 % DV') },
      { label: 'Vitamin B6', value: nb('240 % DV') },
      { label: 'Vitamin B12', value: nb('490 % DV') },
      { label: 'Pantothenic acid (B5)', value: nb('400 % DV') },
    ],
    color: '#a67cf0',
  },
]

// Итоговая остановка: капсулы вернулись в банку, в плашке — весь список
export const INSIDE_SUMMARY = {
  id: 'full-list',
  name: 'The full list',
  text: `All ${INGREDIENT_LIST.length} ingredients, in the order the can prints them.`,
  // Первая буква — заглавная, в конце точка: список читается как абзац этикетки
  list: `${INGREDIENT_LIST.join(', ').replace(/^./, (letter) => letter.toUpperCase())}.`,
  // Акцент итога — ледяной, как у первого экрана
  color: '#4fb0e3',
}

// Остановок в главе: по одной на ингредиент и итог
export const INSIDE_STOPS = INGREDIENTS.length + 1

export const INSIDE_TITLE = 'What’s inside'
export const INSIDE_FACTS_TITLE = 'From the label'
export const INSIDE_LIST_TITLE = 'Ingredients'
export const INSIDE_NOTE =
  'Concept demo, not affiliated with Monster Energy. Copied from a 2012 can label; recipes change, so check your own can.'
