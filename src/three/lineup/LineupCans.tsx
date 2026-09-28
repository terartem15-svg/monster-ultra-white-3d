import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DataTexture, MathUtils, NoColorSpace, SRGBColorSpace, type BufferGeometry, type Group, type Material } from 'three'
import { FLAVORS } from '@/content/flavors'
import { motion } from '@/state/motion'
import { lineupCanActive, lineupCanColliders, sceneState } from '../sceneState'
import { createLabelMaterial, createMetalMaterials, disposeMetalMaterials, setLabelMaps, type LabelMaps } from '../can/canMaterials'
import { CAN_HEIGHT, LID_PANEL_Y, SEAM_TOP, createDomeGeometry, createLidGeometry, createWallGeometry } from '../can/canShape'
import { SURFACE } from '../can/label/canvas'
import { createPullTabGeometry, createRivetGeometry, createScoreLineGeometry } from '../can/lidParts'
import { FLOAT_AMPLITUDE, FLOAT_SPEED } from '../float'
import { carouselPose, createPose, holdTurn } from './carousel'
import { FlavorLabelStore } from './flavorLabels'

// Банки коллекции — все вкусы, кроме первого: первая банка коллекции — это
// банка Ultra White с первого экрана (SlicedCan, её ведёт CanRig), так стык
// глав получается непрерывным. Эти банки целые (не нарезанные), но форма,
// крышка и материалы — те же самые, меняется только этикетка.
//
// Каждый кадр банка встаёт в позу по своему месту в очереди (carousel.ts),
// повторяет наклон за курсором, когда становится текущей, и медленно
// доворачивается под скроллом. Банка очереди, чья этикетка ещё собирается,
// ждёт за кадром в глубине и выплывает, когда этикетка готова. Если до
// готовности банка успела стать текущей, на ней заглушка — чистый алюминий
// без печати (редкость: этикетки заказываются заранее, ещё на первом экране).

const COUNT = FLAVORS.length

// Парение — общее для всей сцены (three/float.ts), фаза у каждой банки своя
// Пока идёт стык с первым экраном, очередь стоит на два места дальше —
// за кадром в глубине — и выплывает по мере стыка
const QUEUE_OFFSET = 2
// Банки в очереди следуют за курсором слабее текущей
const QUEUE_FOLLOW = 0.75
// Банка очереди без готовой этикетки ждёт на столько мест глубже (за кадром)
// и выплывает на своё место, когда этикетка собрана, — вместо пустой
// "болванки" в очереди. Текущую банку (rel ≈ 0) не прячем никогда
const NOT_READY_OFFSET = 2
const READY_SPEED = 4

// Какие этикетки собирать — все банки, которые может быть видно: улетающая
// (до одного места назад) и очередь (до трёх мест вперёд), в порядке
// важности. Держать собранными — чуть шире: у границы при скролле
// туда-обратно этикетка не пересобирается каждый раз. Больше четырёх-пяти
// этикеток в видеопамяти одновременно не бывает.
const WANT_ORDER = [0, 1, -1, 2, 3]
const WANT_BEHIND = 1
const WANT_AHEAD = 3
const KEEP_BEHIND = 1.2
const KEEP_AHEAD = 3.2

interface CanNodes {
  pose: Group
  tilt: Group
  spin: Group
}

// Узлы банок по номеру вкуса — компонент на странице один
const canNodes: (CanNodes | null)[] = []
// Насколько банка "на месте" по готовности этикетки, 0..1 (по номеру вкуса)
const readyIn: number[] = FLAVORS.map(() => 0)

// Временные объекты кадра — один набор на модуль, в useFrame не аллоцируем
const frame = {
  pose: createPose(),
  wanted: [] as number[],
  keep: new Set<number>(),
}

function collectWanted(position: number, out: number[]) {
  out.length = 0
  const current = Math.round(position)
  for (const offset of WANT_ORDER) {
    const index = current + offset
    if (index < 1 || index >= COUNT) continue
    if (index < position - WANT_BEHIND || index >= position + WANT_AHEAD) continue
    out.push(index)
  }
}

// --- Заглушка этикетки ------------------------------------------------------------

// 1×1 текстуры одной на все вкусы заглушки: чистый алюминий без печати — если
// этикетка текущей банки ещё собирается, банка выглядит непокрашенной, а не
// сломанной. Набор карт тот же, что у настоящей этикетки, — и шейдер тот же
function solid(bytes: number[], isColor: boolean): DataTexture {
  const texture = new DataTexture(new Uint8Array([...bytes, 255]), 1, 1)
  texture.colorSpace = isColor ? SRGBColorSpace : NoColorSpace
  texture.needsUpdate = true
  return texture
}

function createPlaceholder(): LabelMaps {
  const [roughness, metalness] = SURFACE.aluminum
  return {
    color: solid([214, 221, 227], true),
    surface: solid([255, Math.round(roughness * 255), Math.round(metalness * 255)], false),
    normal: solid([128, 128, 255], false),
  }
}

// --- Одна банка ------------------------------------------------------------------

interface CanGeometries {
  wall: BufferGeometry
  lid: BufferGeometry
  dome: BufferGeometry
  tab: BufferGeometry
  rivet: BufferGeometry
  score: BufferGeometry
}

interface FlavorCanProps {
  index: number
  geometries: CanGeometries
  label: Material
  lid: Material
  tab: Material
}

// Три вложенные группы — каждая отвечает за одно: pose — место в очереди и
// крен в полёте, tilt — наклон за курсором, spin — поворот вокруг оси
function FlavorCan({ index, geometries, label, lid, tab }: FlavorCanProps) {
  const poseRef = useRef<Group>(null)
  const tiltRef = useRef<Group>(null)
  const spinRef = useRef<Group>(null)

  useEffect(() => {
    const pose = poseRef.current
    const tilt = tiltRef.current
    const spin = spinRef.current
    if (!pose || !tilt || !spin) return
    canNodes[index] = { pose, tilt, spin }
    // Центр банки — для физики льда: целая банка = один цилиндр
    lineupCanColliders[index] = spin
    return () => {
      canNodes[index] = null
      lineupCanColliders[index] = null
      lineupCanActive[index] = false
    }
  }, [index])

  return (
    <group ref={poseRef} visible={false}>
      <group ref={tiltRef}>
        <group ref={spinRef}>
          {/* Геометрия банки — от дна (y = 0); сдвиг ставит её центр в начало координат */}
          <group position-y={-CAN_HEIGHT / 2}>
            <mesh geometry={geometries.wall} material={label} dispose={null} />
            <mesh geometry={geometries.lid} material={lid} dispose={null} />
            <mesh geometry={geometries.score} material={lid} dispose={null} />
            <mesh
              geometry={geometries.tab}
              material={tab}
              position-y={LID_PANEL_Y + 0.006}
              rotation-x={-Math.PI / 2}
              dispose={null}
            />
            <mesh geometry={geometries.rivet} material={tab} position-y={LID_PANEL_Y + 0.017} dispose={null} />
            <mesh geometry={geometries.dome} material={lid} dispose={null} />
          </group>
        </group>
      </group>
    </group>
  )
}

// --- Коллекция -------------------------------------------------------------------

export function LineupCans() {
  const gl = useThree((state) => state.gl)
  const storeRef = useRef<FlavorLabelStore | null>(null)

  const geometries = useMemo<CanGeometries>(
    () => ({
      wall: createWallGeometry(0, SEAM_TOP),
      lid: createLidGeometry(),
      dome: createDomeGeometry(),
      tab: createPullTabGeometry(),
      rivet: createRivetGeometry(),
      score: createScoreLineGeometry(LID_PANEL_Y),
    }),
    [],
  )
  const metal = useMemo(() => createMetalMaterials(), [])
  const placeholder = useMemo(() => createPlaceholder(), [])
  // Материал этикетки на каждый вкус, кроме первого (его банку рисует SlicedCan)
  const labels = useMemo(() => FLAVORS.map((_, index) => (index === 0 ? null : createLabelMaterial(placeholder))), [placeholder])

  // Хранилище этикеток живёт в эффекте: у него есть воркер и видеопамять,
  // которые нужно освободить (а в StrictMode эффект монтируется дважды).
  // На телефоне карты вдвое меньше: там банка мельче, а памяти меньше.
  useEffect(() => {
    const compact = Math.min(window.innerWidth, window.innerHeight) < 700
    const store = new FlavorLabelStore({
      labels: FLAVORS.map((flavor) => flavor.label),
      anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
      scale: compact ? 0.5 : 1,
      onReady: (index, maps) => {
        const material = labels[index]
        if (material) setLabelMaps(material, maps)
      },
      onRelease: (index) => {
        const material = labels[index]
        if (material) setLabelMaps(material, placeholder)
      },
    })
    storeRef.current = store
    return () => {
      store.dispose()
      storeRef.current = null
    }
  }, [gl, labels, placeholder])

  // Геометрия, материалы и заглушки созданы вручную — освобождаем сами
  useEffect(() => {
    return () => {
      for (const geometry of Object.values(geometries)) geometry.dispose()
      disposeMetalMaterials(metal)
      for (const material of labels) material?.dispose()
      placeholder.color.dispose()
      placeholder.surface.dispose()
      placeholder.normal.dispose()
    }
  }, [geometries, metal, labels, placeholder])

  // Приоритет -20: после CanRig (-30), до физики льда (-10) — ей нужны уже
  // поставленные банки
  useFrame((state, delta) => {
    const { flavor, flavorRaw, queueIn, stacked, calm, tiltX, tiltY } = sceneState

    // Этикетки: пока идёт вступление, ничего не заказываем — странице и так
    // есть чем заняться; дальше — банки рядом с текущей (на первом экране —
    // две первые банки очереди)
    const store = storeRef.current
    if (store && sceneState.intro >= 1) {
      const { wanted, keep } = frame
      collectWanted(flavor, wanted)
      keep.clear()
      for (let index = 1; index < COUNT; index++) {
        if (wanted.includes(index) || (index >= flavor - KEEP_BEHIND && index <= flavor + KEEP_AHEAD)) keep.add(index)
      }
      store.sync(wanted, keep)
      store.upload(gl)
    }

    const time = state.clock.elapsedTime
    const pose = frame.pose
    for (let index = 1; index < COUNT; index++) {
      const can = canNodes[index]
      if (!can) continue
      const ready = store?.isReady(index) ? 1 : 0
      readyIn[index] = motion.reducedMotion ? ready : MathUtils.damp(readyIn[index], ready, READY_SPEED, delta)
      const queued = index - flavor + (1 - queueIn) * QUEUE_OFFSET
      const rel = queued + (1 - readyIn[index]) * NOT_READY_OFFSET * MathUtils.smoothstep(queued, 0.3, 1)
      carouselPose(rel, stacked, pose)
      can.pose.visible = pose.visible
      lineupCanActive[index] = pose.visible
      if (!pose.visible) continue

      const bob = Math.sin(time * FLOAT_SPEED + index * 1.7) * FLOAT_AMPLITUDE * calm
      can.pose.position.set(pose.x, pose.y + bob, pose.z)
      can.pose.rotation.set(pose.rotX, 0, pose.rotZ)
      const follow = 1 - Math.min(1, Math.abs(rel)) * QUEUE_FOLLOW
      can.tilt.rotation.set(tiltX, tiltY * follow, 0)
      can.spin.rotation.y = pose.rotY + (motion.reducedMotion ? 0 : holdTurn(flavorRaw, index))
    }
  }, -20)

  return (
    <group>
      {FLAVORS.map((flavor, index) => {
        const label = labels[index]
        return label ? (
          <FlavorCan key={flavor.id} index={index} geometries={geometries} label={label} lid={metal.lid} tab={metal.tab} />
        ) : null
      })}
    </group>
  )
}
