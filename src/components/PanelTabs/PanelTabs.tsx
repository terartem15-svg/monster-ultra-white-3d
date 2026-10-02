import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { PANEL_TABS, type FinalPanelId } from '@/content/final'
import styles from './PanelTabs.module.css'

interface PanelTabsProps {
  active: FinalPanelId
  onSelect: (id: FinalPanelId) => void
}

// Переключатель демо-панелей на телефоне: обе рядом не помещаются под
// банкой, поэтому видна одна. Настоящие вкладки (tablist): стрелки влево и
// вправо переключают и переводят фокус, Tab уходит сразу в панель.
// Подложка текущей вкладки — одна на весь переключатель, она переезжает.
export function PanelTabs({ active, onSelect }: PanelTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeIndex = Math.max(0, PANEL_TABS.findIndex((tab) => tab.id === active))

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + PANEL_TABS.length) % PANEL_TABS.length
    onSelect(PANEL_TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className={styles.tabs} role="tablist" aria-label="Demo panels" style={{ '--active': activeIndex } as CSSProperties}>
      <span className={styles.thumb} aria-hidden="true" />
      {PANEL_TABS.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            tabRefs.current[index] = node
          }}
          id={`tab-${tab.id}`}
          className={styles.tab}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
