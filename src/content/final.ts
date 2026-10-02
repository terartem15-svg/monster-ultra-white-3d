// Тексты финального экрана: заголовок, подсказка «протри иней» и две
// демо-панели — «Find a store» и «Join the pack» (их же открывают кнопки
// шапки). Сайт — демо для портфолио, а не магазин: настоящих точек продаж и
// рассылки нет, и панели говорят об этом прямо. Магазины — не выдуманные
// «реальные» адреса, а типы мест с пометкой sample; почта только проверяется
// в браузере и никуда не уходит. Голос — без «мы», как во всех главах.

export const FINAL_TITLE = 'Stay frosty.'

// Подсказка поверх инея: мышью стекло протирают курсором, на телефоне —
// пальцем; кнопка — для клавиатуры и для тех, кому протирать не хочется
export const FROST_CUE = {
  pointer: 'Wipe the frost',
  touch: 'Swipe across the glass',
  action: 'Break the ice',
}

export const DEMO_BADGE = 'Demo'

// Панели финала: id совпадает с якорем кнопки шапки (content/site.ts)
export type FinalPanelId = 'stores' | 'join'

export interface SampleStore {
  name: string
  // Где в магазине стоит банка — в тему главы «Холод»
  shelf: string
  distance: string
}

export const STORE_PANEL = {
  title: 'Find a store',
  label: 'City or postcode',
  placeholder: 'e.g. Berlin',
  submit: 'Search',
  results: 'Sample results',
  resultsFor: (query: string) => `Sample results for “${query}”`,
  stores: [
    { name: 'Corner shop', shelf: 'Chilled', distance: '0.4 km' },
    { name: 'Supermarket', shelf: 'Chilled', distance: '1.1 km' },
    { name: 'Fuel station', shelf: 'Shelf only', distance: '2.6 km' },
  ] satisfies SampleStore[],
  note: 'Demo, not a store finder: the list is a placeholder and doesn’t change with your search. Nothing you type leaves this page.',
}

export const JOIN_PANEL = {
  title: 'Join the pack',
  text: 'Hear about new flavors and limited drops first.',
  label: 'Email',
  placeholder: 'you@mail.com',
  submit: 'Join',
  errors: {
    empty: 'Enter your email address.',
    invalid: 'That doesn’t look like an email address.',
  },
  done: {
    title: 'You’re in the pack.',
    text: 'Well, almost: this is a demo, so nothing was sent or saved.',
    again: 'Use another email',
  },
  note: 'Demo form: the address is only checked in your browser and is never sent anywhere.',
}

// Переключатель панелей на телефоне (обе панели рядом не помещаются)
export const PANEL_TABS: { id: FinalPanelId; label: string }[] = [
  { id: 'stores', label: STORE_PANEL.title },
  { id: 'join', label: JOIN_PANEL.title },
]
