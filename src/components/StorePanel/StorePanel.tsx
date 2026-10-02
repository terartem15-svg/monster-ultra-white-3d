import { useState, type CSSProperties, type FormEvent } from 'react'
import { DemoField, DemoPanel } from '@/components/DemoPanel/DemoPanel'
import { STORE_PANEL } from '@/content/final'
import styles from './StorePanel.module.css'

// Демо-панель «Find a store». Настоящих точек продаж у сайта нет, поэтому
// и адресов нет: поиск — только интерфейс, а список — типы мест с пометкой
// sample, и он не меняется от запроса (об этом прямо говорит пометка внизу).
// После поиска заголовок списка повторяет запрос и объявляется скринридером,
// строки списка заново проявляются по одной — видно, что поиск «отработал».
export function StorePanel() {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  // Номер поиска: новый ключ списка перезапускает его появление
  const [round, setRound] = useState(0)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = query.trim()
    setSearched(value.length > 0 ? value : null)
    setRound((current) => current + 1)
  }

  return (
    <DemoPanel titleId="stores-title" title={STORE_PANEL.title} side="left" note={STORE_PANEL.note}>
      <form className={styles.form} role="search" aria-labelledby="stores-title" onSubmit={handleSubmit}>
        <DemoField
          id="store-query"
          label={STORE_PANEL.label}
          type="text"
          value={query}
          placeholder={STORE_PANEL.placeholder}
          autoComplete="address-level2"
          submit={STORE_PANEL.submit}
          onChange={setQuery}
        />
      </form>

      <div className={styles.results}>
        <p className={styles.resultsTitle} aria-live="polite">
          {searched ? STORE_PANEL.resultsFor(searched) : STORE_PANEL.results}
        </p>
        <ul key={round} className={styles.list} data-searched={round > 0}>
          {STORE_PANEL.stores.map((store, index) => (
            <li key={store.name} className={styles.store} style={{ '--index': index } as CSSProperties}>
              <span className={styles.mark} data-chilled={store.shelf === 'Chilled'} aria-hidden="true" />
              <span className={styles.name}>{store.name}</span>
              <span className={styles.shelf}>{store.shelf}</span>
              <span className={styles.distance}>{store.distance}</span>
            </li>
          ))}
        </ul>
      </div>
    </DemoPanel>
  )
}
