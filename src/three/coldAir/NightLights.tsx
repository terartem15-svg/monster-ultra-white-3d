import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, type DirectionalLight, type Scene } from 'three'
import { sceneState } from '../sceneState'

// Ночной свет главы «Холод» — как тёмная продуктовая съёмка: студийное
// окружение приглушается (банка уходит в полумрак), а по краям её обводят
// два ледяных контровых света. Правый — общая цветная подсветка коллекции
// (Scene.tsx, LineupLight: ночью она ледяная), левый — этот.
//
// Свет есть в сцене всегда, с нулевой силой вне ночи: его появление
// посреди скролла пересобрало бы шейдеры всех материалов (число источников
// входит в программу).

// Сила левого контрового света ночью
const RIM = 2.2
// Насколько ночью гаснет окружение (отражения студии в металле и лаке)
const NIGHT_ENVIRONMENT = 0.58

// Сцена three.js — внешний изменяемый объект, а не состояние React; общая
// сила окружения задаётся ей, у материалов она не работает (PLAN.md, раздел 5)
function applyNightLight(light: DirectionalLight | null, scene: Scene, dark: number) {
  if (light) light.intensity = RIM * dark
  scene.environmentIntensity = MathUtils.lerp(1, NIGHT_ENVIRONMENT, dark)
}

export function NightLights() {
  const lightRef = useRef<DirectionalLight>(null)
  const scene = useThree((state) => state.scene)

  useFrame(() => {
    applyNightLight(lightRef.current, scene, sceneState.dark)
  })

  return <directionalLight ref={lightRef} position={[-5, 2.2, -3]} color="#9fdcff" intensity={0} />
}
