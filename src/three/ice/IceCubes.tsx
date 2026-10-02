import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  DoubleSide,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Plane,
  Quaternion,
  Ray,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Group,
  type Object3D,
} from 'three'
import { FLAVORS } from '@/content/flavors'
import { motion } from '@/state/motion'
import { CAN_HEIGHT, CAN_PIECES, CAN_RADIUS } from '../can/canShape'
import { lineupLook } from '../lineup/lineupLook'
import { canPieceGroups, lineupCanActive, lineupCanColliders, sceneState } from '../sceneState'
import { createBubblesGeometry, createCracksGeometry, createIceChipGeometry, createIceCubeGeometry } from './iceGeometry'
import { createIceSurface } from './iceSurface'
import { IceWorld, type IceCubeSpec } from './iceWorld'

// Кубики льда вокруг банки — как на продуктовом фото: маленький слева
// вверху, средний справа, большой слева внизу, плюс ещё один в глубине, —
// и мелкая ледяная крошка между ними. Двигает всё физика (iceWorld.ts);
// компонент только передаёт в неё курсор и положение кусков банки и
// копирует результат в меши.
//
// Каждый кусок льда — несколько слоёв:
//  - пузырьки и трещины внутри (непрозрачные — видны только сквозь лёд);
//  - сам лёд с преломлением;
//  - полупрозрачная "плёнка" инея поверх: гуще на рёбрах и углах.

// --- Раскладка ------------------------------------------------------------------------

const CUBES: IceCubeSpec[] = [
  {
    shape: 'cube',
    size: 0.5,
    anchor: [-1.18, 1.38, 0.5],
    enterFrom: [-6.5, 3.8, 0.4],
    rest: [0.35, 0.55, 0.2],
    bob: [0.13, 7.4, 0],
    seed: 11,
  },
  {
    shape: 'cube',
    size: 0.64,
    anchor: [1.24, 0.28, 0.75],
    enterFrom: [7, -0.6, 0.8],
    rest: [0.5, -0.45, 0.32],
    bob: [0.15, 8.2, 1.9],
    seed: 23,
  },
  {
    // Большой кубик перед банкой, как на фото: сквозь него видна этикетка
    shape: 'cube',
    size: 0.84,
    anchor: [-1.02, -1.28, 1.08],
    enterFrom: [-7, -4.2, 1.2],
    rest: [-0.38, 0.62, -0.26],
    bob: [0.12, 6.9, 3.4],
    seed: 37,
  },
  {
    shape: 'cube',
    size: 0.42,
    anchor: [0.98, 1.78, -0.95],
    enterFrom: [6, 5.2, -1],
    rest: [0.8, 0.2, 0.5],
    bob: [0.1, 7.9, 4.6],
    seed: 53,
  },
  // Ледяная крошка — мелкие осколки у банки
  {
    shape: 'chip',
    size: 0.22,
    anchor: [0.92, -0.62, 1.0],
    enterFrom: [6.5, -3.5, 1.2],
    rest: [0.4, 0.9, 0.1],
    bob: [0.09, 5.6, 0.7],
    seed: 71,
  },
  {
    shape: 'chip',
    size: 0.18,
    anchor: [-0.86, 0.42, -0.75],
    enterFrom: [-6, 1.2, -0.8],
    rest: [1.1, 0.3, 0.6],
    bob: [0.08, 6.3, 2.2],
    seed: 83,
  },
  {
    shape: 'chip',
    size: 0.15,
    anchor: [1.42, 1.3, 0.3],
    enterFrom: [6.2, 4.4, 0.3],
    rest: [0.2, 1.4, 0.9],
    bob: [0.07, 5.1, 5.1],
    seed: 97,
  },
]

// Лёд "отпускается" к якорям, когда куски банки уже начали всплывать
const RELEASE_AT = 0.28

// Тела, о которые ударяется лёд: пять кусков банки первого экрана, затем по
// целой банке на каждый следующий вкус коллекции (номер тела = 5 + вкус − 1)
const COLLIDERS = [
  ...CAN_PIECES.map((piece) => ({ radius: CAN_RADIUS, height: piece.y1 - piece.y0 })),
  ...FLAVORS.slice(1).map(() => ({ radius: CAN_RADIUS, height: CAN_HEIGHT })),
]
const FIRST_LINEUP_COLLIDER = CAN_PIECES.length - 1

// --- Материалы ---------------------------------------------------------------------------

// Лёд: физическое пропускание света (transmission) — сквозь кубик видны
// преломлённые банка и фон. Двусторонний материал: three.js тогда рисует и
// задние грани кубика в буфер преломления — появляются внутренние рёбра и
// блики, как у настоящего прозрачного льда (без них кубик — мутное желе).
// Карта нормалей "дробит" преломление рябью и трещинками, карта
// шероховатости делает часть поверхности матовой — иней. ior льда 1.31,
// почти бесцветная толща с лёгким холодным оттенком, лак — резкие блики,
// dispersion — едва заметная радуга на рёбрах.
function createIceMaterials() {
  const surface = createIceSurface()
  return {
    ice: new MeshPhysicalMaterial({
      color: '#ffffff',
      side: DoubleSide,
      transmission: 1,
      thickness: 1.25,
      roughness: 1,
      roughnessMap: surface.roughness,
      normalMap: surface.normal,
      normalScale: new Vector2(0.55, 0.55),
      // Чуть выше настоящего льда (1.31): преломление заметнее, кубик
      // читается кристаллом, а не мутным блоком
      ior: 1.42,
      dispersion: 0.18,
      // Толща льда слегка голубеет: в середине кубика цвет гуще, у краёв
      // светлее — отсюда ощущение объёма даже на светлом фоне
      attenuationColor: '#d0e9f6',
      attenuationDistance: 2.6,
      specularIntensity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      sheen: 0.1,
      sheenColor: '#ffffff',
      sheenRoughness: 0.3,
      envMapIntensity: 2.1,
    }),
    // Иней поверх льда: белая матовая плёнка, прозрачность — из маски в
    // вершинах (iceGeometry.ts); чуть светится, чтобы оставаться белой и в тени
    frost: new MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.85,
      emissive: '#e6f3fb',
      emissiveIntensity: 0.18,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
    // Пузырьки — белёсые, чуть светятся изнутри
    bubbles: new MeshStandardMaterial({ color: '#f7fcff', roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.15 }),
    // Трещины — светлые блестящие пластинки: вспыхивают при повороте льда.
    // Не металл: металл отражал бы тёмный низ окружения и темнел пятном.
    cracks: new MeshStandardMaterial({
      color: '#eef6fb',
      metalness: 0.3,
      roughness: 0.18,
      side: DoubleSide,
    }),
    textures: [surface.normal, surface.roughness],
  }
}

// --- Компонент -------------------------------------------------------------------------------

// Временные объекты кадра: компонент на странице один, поэтому набор
// один на модуль — в useFrame ничего не аллоцируется
const frame = {
  ndc: new Vector2(),
  inverse: new Matrix4(),
  ray: new Ray(),
  plane: new Plane(new Vector3(0, 0, 1), 0),
  pointer: new Vector3(),
  previous: new Vector3(),
  velocity: new Vector3(),
  hasPrevious: false,
  worldPosition: new Vector3(),
  worldQuaternion: new Quaternion(),
  parentQuaternion: new Quaternion(),
}

// Пока не началось вступление, лёд стоит за краями кадра, и его отсекает
// проверка видимости (frustum culling) — а ведь лёд и всё, что внутри него,
// рисуются ещё и в буфер преломления, своими вариантами программ шейдеров.
// Они собрались бы в тот кадр, когда лёд впервые влетит в кадр, — рывком
// посреди вступления. Поэтому под прелоадером лёд рисуется и за кадром, и
// все варианты собираются заранее (Scene.tsx, ReadySignal); со вступлением
// отсечение возвращается
function setCulling(group: Group, culled: boolean) {
  group.traverse((object) => {
    if (object.frustumCulled !== culled) object.frustumCulled = culled
  })
}

// Кинематическое тело следует за куском банки или банкой коллекции: мировая
// матрица объекта → локальное пространство льда (group). Родительский
// поворот уже обращён в frame.parentQuaternion
function followCollider(world: IceWorld, group: Group, object: Object3D | null | undefined, index: number, active: boolean) {
  world.setPieceActive(index, Boolean(object) && active)
  if (!object || !active) return
  object.getWorldPosition(frame.worldPosition)
  object.getWorldQuaternion(frame.worldQuaternion)
  group.worldToLocal(frame.worldPosition)
  frame.worldQuaternion.premultiply(frame.parentQuaternion)
  world.setPiece(index, frame.worldPosition, frame.worldQuaternion)
}

export function IceCubes() {
  const groupRef = useRef<Group>(null)
  const cubeRefs = useRef<(Group | null)[]>([])
  // Отсекается ли лёд за кадром — см. setCulling
  const culled = useRef(true)

  // Пузырьки и трещины — только в кубиках: в мелкой крошке их не разглядеть
  const geometries = useMemo(
    () =>
      CUBES.map((spec) => {
        const cube = spec.shape === 'cube'
        return {
          ice: cube ? createIceCubeGeometry(spec.size, spec.seed) : createIceChipGeometry(spec.size, spec.seed),
          bubbles: cube ? createBubblesGeometry(spec.size, spec.seed) : null,
          cracks: cube ? createCracksGeometry(spec.size, spec.seed) : null,
        }
      }),
    [],
  )
  const materials = useMemo(() => createIceMaterials(), [])

  // Физический мир создаётся в эффекте, а не в useMemo: у него есть
  // "разрушение" (dispose), и в StrictMode эффект монтируется дважды — мир
  // из useMemo после первой очистки остался бы пустым. При reduced motion
  // лёд сразу стоит на местах — без влёта из-за краёв кадра.
  const worldRef = useRef<IceWorld | null>(null)
  useEffect(() => {
    const world = new IceWorld(CUBES, COLLIDERS, motion.reducedMotion)
    worldRef.current = world
    return () => {
      world.dispose()
      worldRef.current = null
    }
  }, [])

  // Геометрия, материалы и текстуры переданы мешам пропами — освобождаем сами
  useEffect(() => {
    return () => {
      for (const { ice, bubbles, cracks } of geometries) {
        for (const geometry of [ice, bubbles, cracks] as (BufferGeometry | null)[]) geometry?.dispose()
      }
      for (const material of [materials.ice, materials.frost, materials.bubbles, materials.cracks]) material.dispose()
      for (const texture of materials.textures) texture.dispose()
    }
  }, [geometries, materials])

  // Приоритет -10: после CanRig (-30) и кусков банки (-20)
  useFrame((state, delta) => {
    const group = groupRef.current
    const world = worldRef.current
    if (!group || !world) return
    group.updateWorldMatrix(true, false)
    const culling = sceneState.intro > 0
    if (culled.current !== culling) {
      culled.current = culling
      setCulling(group, culling)
    }

    if (sceneState.intro > RELEASE_AT) world.release()

    // Кинематические тела — из мировых матриц видимых кусков и банок,
    // переведённых в локальное пространство льда. Банка за кадром тело
    // выключает: иначе лёд "бился" бы о невидимое
    group.getWorldQuaternion(frame.parentQuaternion).invert()
    for (let index = 0; index < CAN_PIECES.length; index++) {
      followCollider(world, group, canPieceGroups[index], index, sceneState.heroCanVisible)
    }
    for (let flavor = 1; flavor < FLAVORS.length; flavor++) {
      followCollider(world, group, lineupCanColliders[flavor], FIRST_LINEUP_COLLIDER + flavor, lineupCanActive[flavor] ?? false)
    }

    // Толща льда окрашивается в цвет текущего вкуса
    materials.ice.attenuationColor.copy(lineupLook.ice)

    // Курсор: луч из камеры через точку указателя, пересечённый с
    // плоскостью z = 0 группы льда. Скорость — производная по кадрам.
    let pointer: Vector3 | null = null
    if (motion.pointerActive && !motion.reducedMotion) {
      state.raycaster.setFromCamera(frame.ndc.set(motion.pointer.x, motion.pointer.y), state.camera)
      frame.ray.copy(state.raycaster.ray)
      frame.ray.applyMatrix4(frame.inverse.copy(group.matrixWorld).invert())
      if (frame.ray.intersectPlane(frame.plane, frame.pointer)) {
        if (frame.hasPrevious && delta > 0) {
          frame.velocity
            .subVectors(frame.pointer, frame.previous)
            .divideScalar(Math.max(delta, 1 / 240))
            .clampLength(0, 12)
        }
        frame.previous.copy(frame.pointer)
        frame.hasPrevious = true
        pointer = frame.pointer
      }
    } else {
      frame.hasPrevious = false
      frame.velocity.set(0, 0, 0)
    }

    world.step(
      delta,
      { position: pointer, velocity: frame.velocity },
      { spread: sceneState.spread, detail: sceneState.detail, calm: sceneState.calm, away: sceneState.clear },
    )

    world.cubes.forEach(({ body }, index) => {
      const mesh = cubeRefs.current[index]
      if (!mesh) return
      mesh.position.set(body.interpolatedPosition.x, body.interpolatedPosition.y, body.interpolatedPosition.z)
      mesh.quaternion.set(
        body.interpolatedQuaternion.x,
        body.interpolatedQuaternion.y,
        body.interpolatedQuaternion.z,
        body.interpolatedQuaternion.w,
      )
    })
  }, -10)

  return (
    <group ref={groupRef}>
      {CUBES.map((spec, index) => {
        const { ice, bubbles, cracks } = geometries[index]
        return (
          <group
            key={spec.seed}
            ref={(mesh) => {
              cubeRefs.current[index] = mesh
            }}
            position={motion.reducedMotion ? spec.anchor : spec.enterFrom}
          >
            {bubbles && <mesh geometry={bubbles} material={materials.bubbles} dispose={null} />}
            {cracks && <mesh geometry={cracks} material={materials.cracks} dispose={null} />}
            <mesh geometry={ice} material={materials.ice} dispose={null} />
            {/* Плёнка инея — чуть больше льда, чтобы не спорить с его поверхностью */}
            <mesh geometry={ice} material={materials.frost} scale={1.006} dispose={null} />
          </group>
        )
      })}
    </group>
  )
}
