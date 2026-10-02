import type { ReactNode, Ref } from 'react'
import { DEMO_BADGE } from '@/content/final'
import styles from './DemoPanel.module.css'

interface DemoPanelProps {
  titleId: string
  title: string
  // Колонка панели: скос и свечение — со стороны банки, как у карточек
  // первого экрана (слева — к правому краю, справа — к левому)
  side: 'left' | 'right'
  note: string
  children: ReactNode
}

// Стеклянная демо-панель финального экрана — то же стекло со скосом, что у
// карточек первого экрана и плашек глав. В шапке панели — заметная метка
// Demo, внизу — пометка, что это не настоящий сервис (content/final.ts).
export function DemoPanel({ titleId, title, side, note, children }: DemoPanelProps) {
  return (
    <div className={styles.panel} data-side={side}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <h3 id={titleId} className={styles.title}>
            {title}
          </h3>
          <span className={styles.badge}>{DEMO_BADGE}</span>
        </div>
        {children}
        <p className={styles.note}>{note}</p>
      </div>
    </div>
  )
}

interface DemoFieldProps {
  id: string
  label: string
  type: 'text' | 'email'
  value: string
  placeholder: string
  autoComplete: string
  submit: string
  onChange: (value: string) => void
  // Сообщение об ошибке под полем: null — ошибки нет, undefined — поле
  // без проверки (строки под ошибку нет вовсе)
  error?: string | null
  inputRef?: Ref<HTMLInputElement>
  // Поле — цель фокуса для кнопки шапки (data-panel-focus); у скрытой
  // формы — нет
  focusTarget?: boolean
}

// Поле с кнопкой в одной пилюле: ввод слева, отправка справа. Подпись —
// настоящий label (на телефоне спрятан визуально, но читается). Ошибка
// связана с полем через aria-describedby и объявляется скринридером
export function DemoField({
  id,
  label,
  type,
  value,
  placeholder,
  autoComplete,
  submit,
  onChange,
  error,
  inputRef,
  focusTarget = true,
}: DemoFieldProps) {
  const errorId = `${id}-error`
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control} data-invalid={Boolean(error)}>
        <input
          ref={inputRef}
          id={id}
          className={styles.input}
          type={type}
          inputMode={type === 'email' ? 'email' : undefined}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          data-panel-focus={focusTarget || undefined}
        />
        <button className={styles.submit} type="submit">
          {submit}
        </button>
      </div>
      {error !== undefined && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
