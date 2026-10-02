import { use, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, RingGeometry, type BufferGeometry, type Group, type Material, type Object3D } from 'three'
import { FLOAT_AMPLITUDE, FLOAT_SPEED } from '../float'
import { canPieceGroups, heroCanRoot, sceneState } from '../sceneState'
import { createLabelMaterial, createLidGlassMaterials, createMetalMaterials, disposeMetalMaterials } from './canMaterials'
import { loadColdSurface } from './cold/coldSurface'
import { applyLidGlass } from './glass'
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
import { createPullTabGeometry, createRivetGeometry, createScoreLineGeometry } from './lidParts'

// Банка Monster Ultra White, разрезанная на пять кусков, как на продуктовом
// фото. Куски парят каждый сам по себе — медленно, вверх-вниз, с лёгким
// поворотом и наклоном, по аналогии со стопкой роботов в референсе. По мере
// скролла куски сходятся в цельную банку (sceneState.assemble), при
// загрузке — всплывают снизу по очереди (sceneState.intro).
//
// В главе «Состав» эта же банка возвращается и становится стеклянной
// (sceneState.glass): у стенок, крышки и дна есть вторые, прозрачные меши
// (слой glass), которые на время главы подменяют обычные (слой solid).
// Подмена мешей, а не свойства transparent у материала: прозрачная версия —
// другая программа шейдера, и так она собирается заранее, вместе со всеми.

// --- Парение ------------------------------------------------------------------------

// Очень медленно и нежно — амплитуда и период общие для сцены (three/float.ts)
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

// Материалы общие с банками коллекции — см. canMaterials.ts; «стеклянные»
// версии — только у этой банки (glass.ts)
function createMaterials(label: CanLabel) {
  const metal = createMetalMaterials()
  const lidGlass = createLidGlassMaterials(metal)
  return {
    label: createLabelMaterial(label),
    glassLabel: createLabelMaterial(label, true),
    ...metal,
    glassLid: lidGlass.lid,
    glassTab: lidGlass.tab,
  }
}

// --- Слои «обычная / стеклянная» ---------------------------------------------------------

// Метки слоёв на мешах (userData): по ним после монтирования собираются
// списки объектов, у которых переключается видимость
const SOLID = { layer: 'solid' } as const
const GLASS = { layer: 'glass' } as const
// Порядок отрисовки прозрачных мешей: сначала крышка и дно, потом стенки —
// стенка ближе к зрителю и ложится поверх
const GLASS_LID_ORDER = 1
const GLASS_WALL_ORDER = 2

type CanLayer = 'solid' | 'glass'

interface CanLayers {
  solid: Object3D[]
  glass: Object3D[]
  // Какой слой сейчас показан; null — ещё ни один (первый кадр)
  shown: CanLayer | null
}

// Показать один слой и спрятать другой — только при смене. Функция уровня
// модуля: объекты сцены меняются из кадра (правило oxlint immutability)
function showLayer(layers: CanLayers, wanted: CanLayer) {
  if (layers.shown === wanted) return
  layers.shown = wanted
  for (const object of layers.solid) object.visible = wanted === 'solid'
  for (const object of layers.glass) object.visible = wanted === 'glass'
}

// --- Компонент --------------------------------------------------------------------------

interface LidMeshesProps {
  parts: LidBuild
  lid: Material
  tab: Material
  renderOrder?: number
}

// Крышка целиком: панель, насечка, язычок и заклёпка — одинаково для
// обычного и стеклянного слоёв, отличаются только материалы
function LidMeshes({ parts, lid, tab, renderOrder = 0 }: LidMeshesProps) {
  return (
    <>
      <mesh geometry={parts.lid} material={lid} renderOrder={renderOrder} dispose={null} />
      <mesh geometry={parts.score} material={lid} renderOrder={renderOrder} dispose={null} />
      <mesh
        geometry={parts.tab}
        material={tab}
        position-y={LID_PANEL_Y + 0.006}
        rotation-x={-Math.PI / 2}
        renderOrder={renderOrder}
        dispose={null}
      />
      <mesh geometry={parts.rivet} material={tab} position-y={LID_PANEL_Y + 0.017} renderOrder={renderOrder} dispose={null} />
    </>
  )
}

export function SlicedCan() {
  // Карты капель и инея — общие для всех этикеток; сцена не покажется, пока
  // они не готовы (весь Canvas под одним Suspense). Запускаются раньше
  // этикетки: строятся, пока она ждёт шрифты, а не после неё
  const coldSurface = loadColdSurface()
  const label = use(loadCanLabel())
  use(coldSurface)
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  const pieces = useMemo(() => buildPieces(), [])
  const lidParts = useMemo(() => buildLidParts(), [])
  const materials = useMemo(() => createMaterials(label), [label])
  const glassLids = useMemo(() => [materials.glassLid, materials.glassTab], [materials])
  const rootRef = useRef<Group>(null)
  const layers = useRef<CanLayers>({ solid: [], glass: [], shown: null })

  // Корень банки — для капсул «Состава» (они лежат в её пространстве), и
  // списки мешей обоих слоёв
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    heroCanRoot.current = root
    const solid: Object3D[] = []
    const glass: Object3D[] = []
    root.traverse((object) => {
      if (object.userData.layer === 'solid') solid.push(object)
      else if (object.userData.layer === 'glass') glass.push(object)
    })
    layers.current = { solid, glass, shown: null }
    return () => {
      heroCanRoot.current = null
    }
  }, [pieces])

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
      materials.label.dispose()
      materials.glassLabel.dispose()
      materials.glassLid.dispose()
      materials.glassTab.dispose()
      disposeMetalMaterials(materials)
    }
  }, [pieces, lidParts, materials])

  // Приоритет -20: после CanRig (-30), который считает sceneState, и до
  // физики льда (-10), которой нужны уже сдвинутые куски
  useFrame((state) => {
    const time = state.clock.elapsedTime
    const { assemble, intro, calm, glass } = sceneState
    const apart = 1 - assemble

    // Стеклянная банка: пока стекла нет совсем, показан обычный слой (его
    // преломляют лёд и капли); иначе — прозрачный. На границе оба слоя
    // выглядят одинаково: прозрачность стеклянного ещё полная
    showLayer(layers.current, glass > 0.001 ? 'glass' : 'solid')
    applyLidGlass(glassLids, glass)

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
    <group ref={rootRef}>
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
            <mesh geometry={build.wall} material={materials.label} userData={SOLID} dispose={null} />
            <mesh
              geometry={build.wall}
              material={materials.glassLabel}
              userData={GLASS}
              visible={false}
              renderOrder={GLASS_WALL_ORDER}
              dispose={null}
            />
            {/* Лёд на срезах — только у обычной банки: сквозь стеклянную
                стенку он был бы виден внутри собранной банки */}
            {build.caps.map((cap) => (
              <group key={cap.y} position-y={cap.y} userData={SOLID}>
                <mesh geometry={cap.crystal} material={materials.crystal} dispose={null} />
                <mesh geometry={cap.edge} material={materials.edge} dispose={null} />
              </group>
            ))}
            {build.piece.hasLid && (
              <>
                <group userData={SOLID}>
                  <LidMeshes parts={lidParts} lid={materials.lid} tab={materials.tab} />
                </group>
                <group userData={GLASS} visible={false}>
                  <LidMeshes parts={lidParts} lid={materials.glassLid} tab={materials.glassTab} renderOrder={GLASS_LID_ORDER} />
                </group>
              </>
            )}
            {build.piece.hasDome && (
              <>
                <mesh geometry={lidParts.dome} material={materials.lid} userData={SOLID} dispose={null} />
                <mesh
                  geometry={lidParts.dome}
                  material={materials.glassLid}
                  userData={GLASS}
                  visible={false}
                  renderOrder={GLASS_LID_ORDER}
                  dispose={null}
                />
              </>
            )}
          </group>
        </group>
      ))}
    </group>
  )
}
