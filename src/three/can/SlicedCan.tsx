import { use, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  MathUtils,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Vector2,
  type BufferGeometry,
  type CanvasTexture,
} from 'three'
import { canPieceGroups, sceneState } from '../sceneState'
import {
  CAN_HEIGHT,
  CAN_PIECES,
  EXPLODE_GAP,
  LID_PANEL_Y,
  SEAM_TOP,
  WALL_THICKNESS,
  createDomeGeometry,
  createLidGeometry,
  createWallGeometry,
  outerRadiusAt,
  type CanPiece,
} from './canShape'
import { createCrystalCapGeometry } from './crystalCap'
import { loadCanLabel, type CanLabel } from './labelTexture'
import { createPullTabGeometry, createRivetGeometry, createScoreLineGeometry, createSpunMetalNormalTexture } from './lidParts'

// Банка Monster Ultra White, разрезанная на пять кусков, как на продуктовом
// фото. Куски парят каждый сам по себе — медленно, вверх-вниз, с лёгким
// поворотом и наклоном, по аналогии со стопкой роботов в референсе. По мере
// скролла куски сходятся в цельную банку (sceneState.assemble), при
// загрузке — всплывают снизу по очереди (sceneState.intro).

// --- Парение ------------------------------------------------------------------------

// Очень медленно и нежно: период подъёма-опускания ~7 с, амплитуда — около
// полутора процентов высоты банки
const FLOAT_AMPLITUDE = 0.05
const FLOAT_SPEED = (Math.PI * 2) / 6.8
const YAW_SWAY = 0.1
const YAW_SPEED = (Math.PI * 2) / 10.5
const TILT_SWAY = 0.02
// Сдвиг фазы между соседними кусками — стопка "дышит" волной, а не хором
const PHASE_STEP = 1.15

// --- Вступление ---------------------------------------------------------------------

// Каждый следующий кусок стартует чуть позже предыдущего, снизу вверх
const INTRO_STAGGER = 0.075
const INTRO_SPAN = 0.6
// Откуда всплывают куски — за нижним краем кадра
const INTRO_DROP = 5.5

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

// --- Геометрия кусков -----------------------------------------------------------------

interface CutCap {
  y: number
  crystal: BufferGeometry
  edge: BufferGeometry
}

interface PieceBuild {
  piece: CanPiece
  // Центр куска в координатах банки (дно на y = 0)
  centerY: number
  // Центр куска в собранной банке относительно её середины
  restY: number
  // Сдвиг в разобранном состоянии: стопка раздвигается от центра
  explodeOffset: number
  wall: BufferGeometry
  caps: CutCap[]
}

// Срез: гранёный "лёд" внутри и тонкое металлическое кольцо стенки по краю
function createCutCap(y: number, facing: 1 | -1, seed: number): CutCap {
  const outer = outerRadiusAt(y)
  const inner = outer - WALL_THICKNESS
  const edge = new RingGeometry(inner, outer, 128, 1)
  edge.rotateX(facing === 1 ? -Math.PI / 2 : Math.PI / 2)
  return { y, crystal: createCrystalCapGeometry(inner, facing, seed), edge }
}

function buildPieces(): PieceBuild[] {
  const last = CAN_PIECES.length - 1
  return CAN_PIECES.map((piece, index) => {
    const caps: CutCap[] = []
    // Нижний срез есть у всех, кроме дна; верхний — у всех, кроме крышки
    if (index > 0) caps.push(createCutCap(piece.y0, -1, index * 17 + 3))
    if (index < last) caps.push(createCutCap(piece.y1, 1, index * 17 + 11))
    const centerY = (piece.y0 + piece.y1) / 2
    return {
      piece,
      centerY,
      restY: centerY - CAN_HEIGHT / 2,
      explodeOffset: (index - last / 2) * EXPLODE_GAP,
      wall: createWallGeometry(piece.y0, piece.hasLid ? SEAM_TOP : piece.y1),
      caps,
    }
  })
}

interface LidBuild {
  lid: BufferGeometry
  dome: BufferGeometry
  tab: BufferGeometry
  rivet: BufferGeometry
  score: BufferGeometry
}

function buildLidParts(): LidBuild {
  return {
    lid: createLidGeometry(),
    dome: createDomeGeometry(),
    tab: createPullTabGeometry(),
    rivet: createRivetGeometry(),
    score: createScoreLineGeometry(LID_PANEL_Y),
  }
}

// --- Материалы -------------------------------------------------------------------------

interface CanMaterials {
  label: MeshPhysicalMaterial
  lid: MeshPhysicalMaterial
  tab: MeshPhysicalMaterial
  edge: MeshStandardMaterial
  crystal: MeshPhysicalMaterial
  spun: CanvasTexture
}

//  - label: корпус. Металличность и шероховатость — из карты surface
//    (серебро орнамента и фольга — металл, белая краска — нет, капли —
//    гладкая вода), рельеф — из карты нормалей: тиснение когтя и надписей,
//    капли конденсата, иней, зерно краски. Сверху прозрачный лак (clearcoat)
//    с тем же рельефом — капли и тиснение ловят блики лака.
//  - lid: крышка и дно — голый алюминий с концентрической "токарной"
//    фактурой; анизотропия вытягивает блики по кругу, как у настоящей крышки.
//  - tab: язычок — чуть светлее и глаже крышки.
//  - edge: срез стенки — свежий блестящий торец металла.
//  - crystal: лёд на срезах. Грани с разными оттенками (vertexColors) и
//    плоское затенение; высокий ior даёт "бриллиантовые" отражения, лёгкая
//    иридесценция — радужный отсвет, как у кристаллов льда на свету.
function createMaterials(label: CanLabel): CanMaterials {
  const spun = createSpunMetalNormalTexture()
  return {
    label: new MeshPhysicalMaterial({
      map: label.color,
      roughnessMap: label.surface,
      metalnessMap: label.surface,
      normalMap: label.normal,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.09,
      clearcoatNormalMap: label.normal,
      clearcoatNormalScale: new Vector2(0.85, 0.85),
      envMapIntensity: 1.15,
    }),
    lid: new MeshPhysicalMaterial({
      color: '#d5dbe0',
      metalness: 1,
      roughness: 0.24,
      normalMap: spun,
      normalScale: new Vector2(0.35, 0.35),
      anisotropy: 0.55,
      envMapIntensity: 1.2,
    }),
    tab: new MeshPhysicalMaterial({
      color: '#e2e7eb',
      metalness: 1,
      roughness: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.25,
    }),
    edge: new MeshStandardMaterial({ color: '#f1f5f8', metalness: 1, roughness: 0.14 }),
    crystal: new MeshPhysicalMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.07,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      ior: 1.9,
      iridescence: 0.32,
      iridescenceIOR: 1.35,
      envMapIntensity: 1.55,
    }),
    spun,
  }
}

// --- Компонент --------------------------------------------------------------------------

export function SlicedCan() {
  const label = use(loadCanLabel())
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  const pieces = useMemo(() => buildPieces(), [])
  const lidParts = useMemo(() => buildLidParts(), [])
  const materials = useMemo(() => createMaterials(label), [label])

  // Анизотропная фильтрация: этикетка на цилиндре видна под острым углом у
  // краёв банки, без неё мелкий текст по бокам "замыливается"
  useEffect(() => {
    const level = Math.min(8, maxAnisotropy)
    for (const texture of [label.color, label.surface, label.normal]) {
      if (texture.anisotropy !== level) {
        texture.anisotropy = level
        texture.needsUpdate = true
      }
    }
  }, [label, maxAnisotropy])

  // Геометрия и материалы созданы вручную и переданы мешам пропами — R3F
  // их сам не освобождает, делаем это при размонтировании
  useEffect(() => {
    return () => {
      for (const build of pieces) {
        build.wall.dispose()
        for (const cap of build.caps) {
          cap.crystal.dispose()
          cap.edge.dispose()
        }
      }
      for (const geometry of Object.values(lidParts)) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
    }
  }, [pieces, lidParts, materials])

  // Приоритет -20: после CanRig (-30), который считает sceneState, и до
  // физики льда (-10), которой нужны уже сдвинутые куски
  useFrame((state) => {
    const time = state.clock.elapsedTime
    const { assemble, intro, calm } = sceneState
    const apart = 1 - assemble

    pieces.forEach((build, index) => {
      const group = canPieceGroups[index]
      if (!group) return
      const phase = index * PHASE_STEP
      const entered = easeOutCubic(MathUtils.clamp((intro - index * INTRO_STAGGER) / INTRO_SPAN, 0, 1))
      const away = 1 - entered
      // Индивидуальное парение гаснет по мере сборки: собранная банка
      // покачивается целиком (это делает CanRig), иначе в ней гуляли бы щели
      const sway = calm * apart

      group.position.y =
        build.restY +
        build.explodeOffset * apart +
        Math.sin(time * FLOAT_SPEED + phase) * FLOAT_AMPLITUDE * sway -
        away * (INTRO_DROP + index * 0.35)
      group.rotation.x =
        build.piece.tilt[0] * apart + Math.sin(time * FLOAT_SPEED * 0.8 + phase + 1) * TILT_SWAY * sway + away * 0.5
      group.rotation.z =
        build.piece.tilt[1] * apart + Math.cos(time * FLOAT_SPEED * 0.7 + phase) * TILT_SWAY * sway - away * 0.3
      group.rotation.y =
        build.piece.yaw * apart + Math.sin(time * YAW_SPEED + phase * 1.3) * YAW_SWAY * sway + away * (1.8 - index * 0.2)
    })
  }, -20)

  return (
    <group>
      {pieces.map((build, index) => (
        <group
          key={build.piece.id}
          // Порядок ZXY: сначала поворот вокруг своей оси, потом наклон —
          // кусок крутится "как юла", а не описывает конус
          rotation-order="ZXY"
          ref={(group) => {
            canPieceGroups[index] = group
          }}
        >
          {/* Геометрия куска построена в координатах целой банки; сдвиг на
              центр куска делает так, что кусок вращается вокруг своей середины */}
          <group position-y={-build.centerY}>
            <mesh geometry={build.wall} material={materials.label} dispose={null} />
            {build.caps.map((cap) => (
              <group key={cap.y} position-y={cap.y}>
                <mesh geometry={cap.crystal} material={materials.crystal} dispose={null} />
                <mesh geometry={cap.edge} material={materials.edge} dispose={null} />
              </group>
            ))}
            {build.piece.hasLid && (
              <>
                <mesh geometry={lidParts.lid} material={materials.lid} dispose={null} />
                <mesh geometry={lidParts.score} material={materials.lid} dispose={null} />
                <mesh
                  geometry={lidParts.tab}
                  material={materials.tab}
                  position-y={LID_PANEL_Y + 0.006}
                  rotation-x={-Math.PI / 2}
                  dispose={null}
                />
                <mesh geometry={lidParts.rivet} material={materials.tab} position-y={LID_PANEL_Y + 0.017} dispose={null} />
              </>
            )}
            {build.piece.hasDome && <mesh geometry={lidParts.dome} material={materials.lid} dispose={null} />}
          </group>
        </group>
      ))}
    </group>
  )
}
