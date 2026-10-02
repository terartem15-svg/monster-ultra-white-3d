import { useRef, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { DemoField, DemoPanel } from '@/components/DemoPanel/DemoPanel'
import { JOIN_PANEL } from '@/content/final'
import styles from './JoinPanel.module.css'

// Достаточно, чтобы отсечь опечатки (нет @, нет домена); строже проверять
// почту регуляркой бессмысленно — это демо, письмо никуда не уйдёт
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Демо-панель «Join the pack»: поле почты и кнопка. Форма только проверяет
// ввод в браузере и показывает «спасибо» — данные никуда не отправляются, и
// это сказано и в ответе, и в пометке внизу.
//
// Фокус ведётся явно: ошибка — фокус остаётся в поле (ошибка объявляется
// скринридером), успех — фокус на заголовке ответа, «другая почта» — снова в
// поле. Цель для кнопки шапки помечена data-panel-focus (sections/Final).
//
// Форма и ответ лежат в одной ячейке, скрытое — visibility: высота панели не
// меняется, и панель (она прижата к низу колонки) не прыгает вверх-вниз.
export function JoinPanel() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = email.trim()
    const problem = value.length === 0 ? JOIN_PANEL.errors.empty : EMAIL.test(value) ? null : JOIN_PANEL.errors.invalid
    if (problem) {
      setError(problem)
      inputRef.current?.focus()
      return
    }
    // Ответ появляется сразу — и сразу получает фокус
    flushSync(() => {
      setError(null)
      setDone(true)
    })
    doneRef.current?.focus()
  }

  const handleAgain = () => {
    flushSync(() => {
      setDone(false)
      setEmail('')
    })
    inputRef.current?.focus()
  }

  const handleChange = (value: string) => {
    setEmail(value)
    // Ошибка снимается, как только поле поправили
    if (error) setError(null)
  }

  return (
    <DemoPanel titleId="join-title" title={JOIN_PANEL.title} side="right" note={JOIN_PANEL.note}>
      <div className={styles.body}>
        <form className={styles.form} aria-labelledby="join-title" noValidate onSubmit={handleSubmit} data-shown={!done}>
          <p className={styles.text}>{JOIN_PANEL.text}</p>
          <DemoField
            id="join-email"
            label={JOIN_PANEL.label}
            type="email"
            value={email}
            placeholder={JOIN_PANEL.placeholder}
            autoComplete="email"
            submit={JOIN_PANEL.submit}
            onChange={handleChange}
            error={error}
            inputRef={inputRef}
            focusTarget={!done}
          />
        </form>
        <div className={styles.done} data-shown={done}>
          <span className={styles.check} aria-hidden="true" />
          <p ref={doneRef} className={styles.doneTitle} tabIndex={-1} data-panel-focus={done || undefined}>
            {JOIN_PANEL.done.title}
          </p>
          <p className={styles.doneText}>{JOIN_PANEL.done.text}</p>
          <button className={styles.again} type="button" onClick={handleAgain}>
            {JOIN_PANEL.done.again}
          </button>
        </div>
      </div>
    </DemoPanel>
  )
}
