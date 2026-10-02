import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils, Matrix4, MeshPhysicalMaterial, Quaternion, SphereGeometry, Vector3, type InstancedMesh } from 'three'
import { smoothstep } from '@/utils/smoothstep'
import { lineupLook } from './lineup/lineupLook'
import { sceneState } from './sceneState'
import { createRandom, randomRange } from './utils/random'

// Капли воды, медленно летающие вокруг банки. Брызги с фото убраны (по
// брифу), остались только капли: каждая идёт по своей наклонной орбите
// вокруг оси банки и заодно покачивается вверх-вниз — проходя перед банкой,
// капля преломляет этикетку, за банкой — прячется. Все капли — один
// InstancedMesh: один вызов отрисовки на все капли. В главах «Холод» и
// «Состав» капли исчезают — сцена расчищается (sceneState.clear): ночью на
// тёмном фоне прозрачные капли читались бы пустыми кольцами (там вместо них
// морозный пар и ледяная пыль, three/cold/*), а в «Составе» летают капсулы.

const COUNT = 46

interface DropletSpec {
  radius: number
  orbit: number
  angle: number
  speed: number
  height: number
  bobAmplitude: number
  bobSpeed: number
  phase: number
  // Сплющенность орбиты по глубине и её наклон — орбиты не лежат в одной плоскости
  depth: number
  tilt: number
  // Задержка появления при загрузке, доля вступления
  delay: number
}

function createDroplets(): DropletSpec[] {
  const random = createRandom(97)
  return Array.from({ length: COUNT }, () => {
    // Больше мелких капель, чем крупных — так выглядит настоящая россыпь
    const sizeRoll = random() ** 2.2
    return {
      radius: 0.016 + sizeRoll * 0.055,
      orbit: randomRange(random, 0.95, 2.25),
      angle: randomRange(random, 0, Math.PI * 2),
      speed: randomRange(random, 0.05, 0.16) * (random() > 0.35 ? 1 : -1),
      height: randomRange(random, -2.05, 2.05),
      bobAmplitude: randomRange(random, 0.04, 0.14),
      bobSpeed: randomRange(random, 0.6, 1.2),
      phase: randomRange(random, 0, Math.PI * 2),
      depth: randomRange(random, 0.55, 0.9),
      tilt: randomRange(random, -0.28, 0.28),
      delay: randomRange(random, 0.3, 0.75),
    }
  })
}

// Вода: полное пропускание, ior 1.33, почти нулевая шероховатость — капля
// работает как маленькая линза. Лак (clearcoat) добавляет яркий блик.
function createDropletMaterial() {
  return new MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    thickness: 0.12,
    roughness: 0.02,
    ior: 1.33,
    attenuationColor: '#d4eefb',
    attenuationDistance: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 1.7,
  })
}

// Временные объекты кадра: один набор на модуль, в useFrame не аллоцируем
const frameScratch = { matrix: new Matrix4(), position: new Vector3(), scale: new Vector3(), quaternion: new Quaternion() }

export function Droplets() {
  const meshRef = useRef<InstancedMesh>(null)
  const droplets = useMemo(() => createDroplets(), [])
  const geometry = useMemo(() => new SphereGeometry(1, 20, 14), [])
  const material = useMemo(() => createDropletMaterial(), [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const time = state.clock.elapsedTime
    const { spread, intro, calm } = sceneState
    // Капли «высыхают» в первой половине расчистки сцены
    const present = 1 - smoothstep(sceneState.clear, 0, 0.6)
    mesh.visible = present > 0
    if (!mesh.visible) return
    const { matrix, position, scale, quaternion } = frameScratch

    droplets.forEach((drop, index) => {
      // На скролле капли закручиваются шире и быстрее — "вихрь" вокруг
      // собирающейся банки
      // При reduced motion (calm = 0) капли замирают на своих местах
      const angle = drop.angle + time * drop.speed * (1 + spread * 2.2) * Math.min(1, calm * 4)
      const orbit = drop.orbit * (1 + spread * 0.45)
      const x = Math.cos(angle) * orbit
      const z = Math.sin(angle) * orbit * drop.depth
      const y = drop.height + Math.sin(time * drop.bobSpeed + drop.phase) * drop.bobAmplitude * calm + x * drop.tilt

      const appear = MathUtils.smoothstep(intro, drop.delay, drop.delay + 0.25)
      const size = drop.radius * appear * present
      position.set(x, y, z)
      // Капля чуть вытянута по вертикали — как в полёте
      scale.set(size, size * 1.12, size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    // Вода окрашивается вместе со льдом — в цвет текущего вкуса
    material.attenuationColor.copy(lineupLook.droplet)
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, COUNT]} frustumCulled={false} dispose={null} />
}
