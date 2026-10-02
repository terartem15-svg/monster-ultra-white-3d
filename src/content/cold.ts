// Тексты и числа главы «Холод»: остановки (что происходит с банкой при этой
// температуре), состояние поверхности для табло, подписи шкалы и два
// физических порога. Один источник и для DOM (табло, шкала, текст), и для
// 3D (когда появляются капли, иней, морозный пар и ледяная пыль).
//
// Цифры здесь — не факты о продукте, а физика: точка росы для комнаты
// 22 °C и влажности 60 % — около 14 °C, вода замерзает при 0 °C. Банка у нас
// в главе остывает «на глазах» — это иллюстрация, о чём честно сказано в
// пометке. Температура подачи 2 °C — та же, что на первом экране.
//
// Голос — нейтральный, без «мы»: сайт не от лица бренда (с Monster Energy
// демо не связано), поэтому советы — во втором лице, как на первом экране.

export interface ColdStop {
  id: string
  // Температура банки на остановке, °C
  temperature: number
  title: string
  // Короткая подпись — для кнопки шкалы
  label: string
  text: string
}

// Неразрывный пробел между числом и единицей: «14 °C» не рвётся строкой
const nb = (value: string) => value.replaceAll(' °C', ' °C')

export const COLD_STOPS: ColdStop[] = [
  {
    id: 'room',
    temperature: 22,
    title: 'Room temperature.',
    label: 'Room',
    text: 'Straight off the shelf. The aluminium is dry, and the air around it holds on to its moisture.',
  },
  {
    id: 'fridge',
    temperature: 2,
    title: 'Fridge-cold.',
    label: 'Fridge',
    text: nb('Past the dew point, about 14 °C in a typical room, water vapour condenses and beads on the metal. This is the moment to crack it.'),
  },
  {
    id: 'frost',
    temperature: -4,
    title: 'Below zero.',
    label: 'Below zero',
    text: 'The beads freeze and frost feathers across the can, while ice crystals glitter in the air. Too cold to drink, but it looks the part.',
  },
]

export const COLD_TEMPERATURES = COLD_STOPS.map((stop) => stop.temperature)

// Пороги, от которых зависит, что видно на банке. Они же — подписи на шкале
export const COLD_PHYSICS = {
  // Ниже — на банке конденсат
  dewPoint: 14,
  // Ниже — капли замерзают, по металлу идёт иней
  freezing: 0,
}

export const COLD_THRESHOLDS = [
  { temperature: COLD_PHYSICS.dewPoint, label: 'dew point' },
  { temperature: COLD_PHYSICS.freezing, label: 'freezing' },
]

// Диапазон шкалы, °C: с запасом над первой остановкой и под последней
export const COLD_SCALE = { top: 24, bottom: -6 }

// Состояние поверхности банки для табло — по тем же порогам, что видит
// шейдер (three/can/cold/coldSurface.ts): выше точки росы сухо, ниже —
// конденсат, ниже нуля капли замерзают, к −3 °C банка в инее. below —
// ниже какой температуры состояние наступает
export const COLD_STATES = [
  { id: 'dry', below: Number.POSITIVE_INFINITY, label: 'Dry' },
  { id: 'condensing', below: COLD_PHYSICS.dewPoint, label: 'Condensing' },
  { id: 'freezing', below: COLD_PHYSICS.freezing, label: 'Freezing' },
  { id: 'frosted', below: -3, label: 'Frosted' },
] as const

export type ColdStateId = (typeof COLD_STATES)[number]['id']

// Состояние при температуре: последнее, чей порог уже пройден
export function coldStateAt(temperature: number): (typeof COLD_STATES)[number] {
  let state: (typeof COLD_STATES)[number] = COLD_STATES[0]
  for (const entry of COLD_STATES) if (temperature < entry.below) state = entry
  return state
}

export const COLD_TITLE = 'Cooling down'
export const COLD_READOUT_LABEL = 'Surface temperature'
export const COLD_NOTE = 'Concept demo. The dew point assumes a room at 22 °C and 60 % humidity.'

// Настоящий минус (U+2212), а не дефис: у дефиса другая ширина и высота
const sign = (value: number) => (value < 0 ? '−' : '')

// «−4 °C» — с неразрывным пробелом: число не отрывается от единицы
export const formatTemperature = (value: number) => `${sign(value)}${Math.abs(value)} °C`
// «−4°» — коротко, для шкалы
export const formatDegrees = (value: number) => `${sign(value)}${Math.abs(value)}°`
