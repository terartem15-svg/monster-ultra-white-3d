import { use, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, LinearFilter, MathUtils, NoColorSpace, type BufferGeometry, type Mesh, type PerspectiveCamera } from 'three'
import { FROST_TIMING, frost, frostElapsed, frostMaskCanvas, paintFrostClaw } from '@/state/frost'
import { smoothstep } from '@/utils/smoothstep'
import { sceneState } from '../sceneState'
import { createFrostMaterial, frostUniforms } from './frostMaterial'
import { FROST_PATTERN_SIZE, FROST_PATTERN_TEXEL, loadFrostPattern } from './frostPattern'
import { buildShardGeometry } from './shards'

// Морозное стекло финального экрана — лист во весь кадр между камерой и
// банкой. Скролл затягивает его инеем от краёв (sceneState.frostGrow),
// указатель протирает (маска в state/frost.ts), а когда стекло разбито —
// коготь прорезает иней, по стеклу бегут трещины и осколки осыпаются
// (тайминги — FROST_TIMING). При «уменьшить движение» иней не бьётся, а тает.
// Внешний вид и падение осколков — в шейдере (frostMaterial.ts), здесь —
// только ход времени, размеры и текстуры.
//
// Лист висит в корне сцены, не в риге банки: он привязан к экрану, а не к
// банке. Камера неподвижна, поэтому размер листа — это просто видимый кадр
// на его глубине.

// Глубина листа: перед банкой и льдом, но так, чтобы осколки, летящие к
// камере, не упёрлись в её ближнюю плоскость
const FROST_Z = 5
// Размытие сцены за самым толстым инеем, CSS px
const BLUR_PX = 22
// Размер грани кристалла на экране, CSS px (зерно — 34 грани на плитку)
const GRAIN_PX = 7
const GRAIN_CELLS = 34

// Маска протёртого — текстура из canvas: обновляется, только когда в неё
// рисовали. Без мип-уровней: маска маленькая, и её край шейдер рвёт сам
function createMaskTexture(): CanvasTexture {
  const texture = new CanvasTexture(frostMaskCanvas())
  texture.colorSpace = NoColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

interface ShardState {
  geometry: BufferGeometry
  // По какому разбитию нарезано стекло; −1 — ещё ни по какому
  version: number
}

// Видимость и смена нарезки — функциями уровня модуля: объекты сцены
// меняются из кадра (правило oxlint immutability)
function setVisible(mesh: Mesh, visible: boolean) {
  if (mesh.visible !== visible) mesh.visible = visible
}

// Стекло режется заново вокруг каждой новой точки удара. Набор атрибутов
// тот же — шейдер не пересобирается, меняются только буферы
function recut(mesh: Mesh, shards: ShardState, aspect: number) {
  const previous = shards.geometry
  shards.geometry = buildShardGeometry(frost.origin, aspect, 9001 + frost.version)
  shards.version = frost.version
  mesh.geometry = shards.geometry
  previous.dispose()
}

function markMask(mask: CanvasTexture) {
  mask.needsUpdate = true
  frost.dirty = false
}

// Самый дальний от точки удара угол экрана, в высотах экрана: до него
// добегают трещины, и по нему считается задержка самого дальнего осколка
function farthestCorner(aspect: number): number {
  const x = frost.origin.x * aspect
  const y = frost.origin.y
  return Math.max(Math.hypot(x, y), Math.hypot(aspect - x, y), Math.hypot(x, 1 - y), Math.hypot(aspect - x, 1 - y))
}

export function FrostGlass() {
  const pattern = use(loadFrostPattern())
  const meshRef = useRef<Mesh>(null)
  const mask = useMemo(() => createMaskTexture(), [])
  const material = useMemo(() => createFrostMaterial(pattern, mask), [pattern, mask])
  const shards = useMemo<ShardState>(() => ({ geometry: buildShardGeometry(frost.origin, 16 / 10, 9001), version: -1 }), [])

  // Материал, маска и нарезка созданы вручную — освобождаем сами
  useEffect(() => {
    return () => {
      material.dispose()
      mask.dispose()
      shards.geometry.dispose()
    }
  }, [material, mask, shards])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const { width, height } = state.size
    frost.view.width = width
    frost.view.height = height

    // Стекло на экране, пока есть иней: затянуло по скроллу, не растаяло и
    // осколки ещё не упали за кадр
    const elapsed = frostElapsed()
    const broken = frost.phase === 'broken'
    const shatter = broken && frost.mode === 'shatter'
    const meltByTime = broken && !shatter ? smoothstep(elapsed, 0, FROST_TIMING.melt) : 0
    const melt = Math.max(sceneState.frostMelt, meltByTime)
    const visible = sceneState.frostGrow > 0.001 && melt < 0.999 && !(shatter && elapsed > FROST_TIMING.done)
    setVisible(mesh, visible)
    if (!visible) return

    const aspect = width / Math.max(1, height)
    if (shards.version !== frost.version) recut(mesh, shards, aspect)

    // Удар когтя рисуется в маску кадр за кадром — пряди «режут» сверху вниз.
    // До самого падения осколков: если кадры редкие (вкладка подвисла), удар
    // дорисуется целиком, а лишние вызовы ничего не рисуют (state/frost.ts)
    const [clawFrom, clawTo] = FROST_TIMING.claw
    if (shatter && elapsed < FROST_TIMING.fall) paintFrostClaw(MathUtils.clamp((elapsed - clawFrom) / (clawTo - clawFrom), 0, 1))
    if (frost.dirty) markMask(mask)

    // Лист — ровно видимый кадр на своей глубине
    const camera = state.camera as PerspectiveCamera
    const sheetHeight = 2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - FROST_Z)
    const u = frostUniforms
    u.uFrostSize.value.set(sheetHeight * aspect, sheetHeight)
    u.uFrostAspect.value = aspect
    u.uFrostTile.value.set(width / (FROST_PATTERN_SIZE * FROST_PATTERN_TEXEL), height / (FROST_PATTERN_SIZE * FROST_PATTERN_TEXEL))
    u.uFrostGrainRepeat.value.set(width / (GRAIN_CELLS * GRAIN_PX), height / (GRAIN_CELLS * GRAIN_PX))
    u.uFrostGrow.value = sceneState.frostGrow
    u.uFrostMelt.value = melt

    // Размытие в CSS px одинаковое при любой плотности пикселей: мип-уровень
    // буфера за стеклом = log2(шероховатость · ширина буфера)
    const dpr = state.gl.getPixelRatio()
    u.uFrostBlur.value = MathUtils.clamp(Math.log2(BLUR_PX * dpr) / Math.log2(Math.max(2, width * dpr)), 0, 1)

    // Трещины и падение — только когда стекло бьётся
    const reach = farthestCorner(aspect)
    const [crackFrom, crackTo] = FROST_TIMING.crack
    const crack = shatter ? (elapsed - crackFrom) / (crackTo - crackFrom) : -1
    u.uFrostOrigin.value.set(frost.origin.x, frost.origin.y)
    u.uFrostReach.value = reach
    u.uFrostCrack.value = crack < 0 ? -1 : smoothstep(crack, 0, 1) * reach * 1.05 + 0.02
    u.uFrostFall.value = shatter ? elapsed - FROST_TIMING.fall : -1
    u.uFrostStagger.value = FROST_TIMING.stagger
    u.uFrostBroken.value = shatter ? 1 : 0
  })

  // Лист — после всех преломляющих объектов (лёд, капли): он ближе всех к камере
  return (
    <mesh
      ref={meshRef}
      geometry={shards.geometry}
      material={material}
      position-z={FROST_Z}
      renderOrder={10}
      frustumCulled={false}
      visible={false}
      dispose={null}
    />
  )
}
