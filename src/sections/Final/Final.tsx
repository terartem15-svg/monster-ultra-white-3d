import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { FrostCue } from '@/components/FrostCue/FrostCue'
import { JoinPanel } from '@/components/JoinPanel/JoinPanel'
import { PanelTabs } from '@/components/PanelTabs/PanelTabs'
import { StorePanel } from '@/components/StorePanel/StorePanel'
import { FINAL_TITLE, type FinalPanelId } from '@/content/final'
import { createFinalScroll, finalScrollTop } from '@/animations/finalScroll'
import { LINEUP_BREAKPOINTS, LOW_SCREEN_QUERY, finalDistance } from '@/animations/scrollPhases'
import { useFrostWiping } from '@/hooks/useFrostWiping'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSlotTracking } from '@/hooks/useSlotTracking'
import { breakFrost, frost, subscribeFrost } from '@/state/frost'
import { motion, type SlotRect } from '@/state/motion'
import { registerSectionAnchor } from '@/state/navigation'
import styles from './Final.module.css'

// Финальный экран. Банка Ultra White снова в центре, лёд возвращается к ней,
// и экран затягивает иней — морозное стекло между зрителем и банкой
// (three/final/*). Курсор (на телефоне — палец) протирает иней; протёрли
// достаточно, нажали «Break the ice» или доскроллили дальше — по инею бьёт
// коготь, стекло трескается и осыпается (state/frost.ts). За ним — две
// демо-панели: «Find a store» и «Join the pack», к ним же ведут кнопки шапки.
//
// Здесь — только DOM: слот под банку, заголовок, подсказка поверх инея и
// панели. Панели и подсказку переключает состояние инея: атрибут data-frost
// секции, CSS решает, что видно.
//
// Высота секции — из тех же чисел, что и тайминги (animations/scrollPhases.ts).

const writeSlot = (rect: SlotRect) => {
  motion.finalSlot = rect
}

const SECTION_STYLE = {
  '--final-scroll': finalDistance('regular'),
  '--final-scroll-compact': finalDistance('compact'),
} as CSSProperties

// Панели по одной, с переключателем: на телефоне (граница та же, что у
// глав) и на низком экране — телефоне лёжа (Final.module.css)
const COMPACT_QUERY = `(max-width: ${LINEUP_BREAKPOINTS.compact - 1}px), ${LOW_SCREEN_QUERY}`

// Поле панели, куда кнопка шапки переводит фокус (помечено data-panel-focus)
const focusTarget = (slot: RefObject<HTMLElement | null>) => slot.current?.querySelector<HTMLElement>('[data-panel-focus]') ?? null

export function Final() {
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const storesRef = useRef<HTMLDivElement>(null)
  const joinRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const compact = useMediaQuery(COMPACT_QUERY)
  const [panel, setPanel] = useState<FinalPanelId>('stores')

  useSlotTracking(slotRef, viewportRef, writeSlot)
  useFrostWiping()

  useEffect(() => {
    const section = sectionRef.current
    const viewport = viewportRef.current
    if (!section || !viewport) return
    return createFinalScroll(section, { viewport })
  }, [])

  // Состояние инея → атрибуты секции. Не через React: панель должна стать
  // видимой (и принимать фокус) в тот же момент, когда иней разбит, — кнопки
  // шапки переводят в неё фокус сразу по прибытии. Подсказка с кнопкой
  // «Break the ice» в тот же момент выходит из порядка Tab (inert): она гаснет
  // за 200 мс, и Tab в эти мгновения вернулся бы на уже ненужную кнопку
  useEffect(() => {
    const section = sectionRef.current
    const cue = cueRef.current
    if (!section || !cue) return
    const sync = () => {
      section.dataset.frost = frost.phase
      section.dataset.wiped = String(frost.wiped)
      cue.inert = frost.phase === 'broken'
    }
    sync()
    return subscribeFrost(sync)
  }, [])

  // Кнопки шапки «Find a store» и «Join the pack»: скролл к открытому экрану
  // (по пути иней разбивается сам) и фокус в поле панели. На телефоне панели
  // по одной — сначала переключиться на нужную, синхронно, чтобы поле уже
  // было видно, когда в него придёт фокус
  useEffect(() => {
    const top = () => {
      const section = sectionRef.current
      const viewport = viewportRef.current
      return section && viewport ? finalScrollTop(section, viewport, 1) : 0
    }
    const panelAnchor = (id: FinalPanelId, slot: RefObject<HTMLElement | null>) =>
      registerSectionAnchor(id, {
        top,
        element: () => {
          flushSync(() => setPanel(id))
          return focusTarget(slot)
        },
        focusOnArrival: true,
      })
    const stores = panelAnchor('stores', storesRef)
    const join = panelAnchor('join', joinRef)
    // Ссылка футера ведёт к самому финалу — к инею (если он уже разбит,
    // экран открыт)
    const chapter = registerSectionAnchor('final', {
      top: () => {
        const section = sectionRef.current
        const viewport = viewportRef.current
        return section && viewport ? finalScrollTop(section, viewport, 0) : 0
      },
      element: () => sectionRef.current,
    })
    return () => {
      stores()
      join()
      chapter()
    }
  }, [])

  // «Break the ice»: подсказка с кнопкой гаснет вместе с инеем — фокус
  // переходит в главу, и следующий Tab ведёт в панели
  const handleBreak = useCallback(() => {
    breakFrost(motion.reducedMotion ? 'melt' : 'shatter')
    sectionRef.current?.focus({ preventScroll: true })
  }, [])

  // На телефоне и низком экране панели — вкладки; на остальных обе видны,
  // и роли вкладок у них нет
  const tabPanel = (id: FinalPanelId) =>
    compact ? { id: `panel-${id}`, role: 'tabpanel', 'aria-labelledby': `tab-${id}` } : { id: `panel-${id}` }

  return (
    <section
      id="final"
      ref={sectionRef}
      className={styles.final}
      style={SECTION_STYLE}
      aria-labelledby="final-title"
      tabIndex={-1}
    >
      <div ref={viewportRef} className={styles.viewport}>
        {/* Подсказка — раньше панелей в разметке: Tab с кнопки «Break the ice»
            ведёт в поле поиска, даже если иней разбился сам, пока на ней фокус */}
        <div className={styles.cueSlot} data-final-ui="lead">
          <div ref={cueRef} className={styles.cueInner}>
            <FrostCue onBreak={handleBreak} />
          </div>
        </div>

        <div className={styles.grid}>
          <div ref={slotRef} className={styles.stage} aria-hidden="true" />

          {/* Внешние обёртки (data-final-ui) проявляет стык с «Составом»,
              внутренние (.reveal) показывает разбитый иней */}
          <div className={styles.titleSlot} data-final-ui="lead">
            <h2 id="final-title" className={styles.title}>
              {FINAL_TITLE}
            </h2>
          </div>

          {/* Переключатель есть всегда, но виден только на телефоне и низком
              экране (CSS): разметка не меняется при повороте, и анимации
              стыка её знают */}
          <div className={styles.tabsSlot} data-final-ui="panel">
            <div className={styles.reveal}>
              <PanelTabs active={panel} onSelect={setPanel} />
            </div>
          </div>

          <div className={styles.storesSlot} data-final-ui="panel">
            <div ref={storesRef} className={styles.reveal} data-tab-hidden={compact && panel !== 'stores'} {...tabPanel('stores')}>
              <StorePanel />
            </div>
          </div>

          <div className={styles.joinSlot} data-final-ui="panel">
            <div ref={joinRef} className={styles.reveal} data-tab-hidden={compact && panel !== 'join'} {...tabPanel('join')}>
              <JoinPanel />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
