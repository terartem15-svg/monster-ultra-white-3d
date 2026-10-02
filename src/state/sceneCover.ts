// Закрыта ли 3D-сцена целиком. Футер наезжает на финальный экран и в конце
// закрывает окно полностью: рисовать кадры, которых не видно, незачем —
// сцена переходит в режим «по запросу» и не жжёт батарею (three/Scene.tsx).
// Пишет animations/footerScroll.ts, читает сцена.
//
// Меняется редко (на границе футера), поэтому это маленький store с
// подпиской, а не поле в motion: в режиме «по запросу» кадров нет, и опрашивать
// значение из useFrame было бы некому.

let covered = false
const listeners = new Set<() => void>()

export function setSceneCovered(value: boolean) {
  if (value === covered) return
  covered = value
  for (const listener of listeners) listener()
}

export function isSceneCovered(): boolean {
  return covered
}

export function subscribeSceneCovered(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
