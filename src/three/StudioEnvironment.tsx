import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BackSide,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  type BufferGeometry,
} from 'three'

// Студийное освещение для металла и льда. Металлической банке нужен не
// "свет", а то, что в ней отражается: без окружения алюминий выглядит
// серым пластиком. Окружение — отдельная маленькая сцена из светящихся
// панелей, которая один раз запекается в карту отражений (PMREM) и
// становится scene.environment: ни внешних HDR-файлов, ни затрат на кадр.
//
// Схема как у предметной съёмки напитков: длинный софтбокс сверху, две
// вертикальные полосы по бокам (дают характерные блики на цилиндре),
// холодный контровой свет сзади — "голубоватое освещение" бренда — и мягкое
// кольцо спереди, которое зажигает искры во льду и каплях.

interface Panel {
  shape: 'rect' | 'ring'
  // Яркость в единицах HDR: > 1 — светится ярче белого
  intensity: number
  color: string
  position: [number, number, number]
  scale: [number, number]
}

const PANELS: Panel[] = [
  // Софтбокс сверху-спереди — длинный мягкий блик по верху кусков
  { shape: 'rect', intensity: 2.6, color: '#ffffff', position: [0, 6, 4], scale: [12, 3] },
  // Вертикальные полосы по бокам — главные блики цилиндра
  { shape: 'rect', intensity: 3.4, color: '#ffffff', position: [-5, 0.5, 3], scale: [1.3, 11] },
  { shape: 'rect', intensity: 2.4, color: '#d6efff', position: [5, 0, 2.5], scale: [1.7, 11] },
  // Холодный контровой свет сзади — ледяной ореол по краям
  { shape: 'rect', intensity: 2.2, color: '#b9e2ff', position: [0, 1.5, -7], scale: [14, 3.5] },
  // Кольцо спереди — искры во льду и каплях
  { shape: 'ring', intensity: 1.6, color: '#ffffff', position: [2, 2.5, 7], scale: [2.6, 2.6] },
]

// Комната вокруг банки: светлый верх, серо-голубой горизонт, тёмный низ.
// Тёмный низ важен — именно он даёт металлу контраст, иначе всё белое.
function createRoom(): Mesh {
  const geometry = new SphereGeometry(40, 48, 24)
  const position = geometry.getAttribute('position')
  const colors: number[] = []
  const top = new Color('#ffffff')
  const horizon = new Color('#d7e3ec')
  const bottom = new Color('#7d91a3')
  const color = new Color()
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / 40
    if (t > 0) color.lerpColors(horizon, top, Math.min(1, t * 1.6))
    else color.lerpColors(horizon, bottom, Math.min(1, -t * 1.4))
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, side: BackSide, toneMapped: false }))
}

function createPanel(panel: Panel): Mesh {
  const geometry: BufferGeometry =
    panel.shape === 'ring' ? new RingGeometry(0.42, 0.5, 64) : new PlaneGeometry(1, 1)
  const material = new MeshBasicMaterial({
    color: new Color(panel.color).multiplyScalar(panel.intensity),
    side: DoubleSide,
    toneMapped: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...panel.position)
  mesh.scale.set(panel.scale[0], panel.scale[1], 1)
  // Панель развёрнута лицом к банке
  mesh.lookAt(0, 0, 0)
  return mesh
}

export function StudioEnvironment() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const studio = new Scene()
    studio.add(createRoom(), ...PANELS.map(createPanel))

    // Запекание: сцена рендерится в кубическую карту и фильтруется под
    // разную шероховатость материалов (PMREM) — один раз при монтировании
    const generator = new PMREMGenerator(gl)
    const target = generator.fromScene(studio, 0.02)
    // Сцена three.js — внешний изменяемый объект, а не состояние React:
    // назначить ей окружение напрямую — штатный способ в R3F
    // oxlint-disable-next-line react/immutability
    scene.environment = target.texture

    return () => {
      scene.environment = null
      target.dispose()
      generator.dispose()
      studio.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose()
          ;(object.material as MeshBasicMaterial).dispose()
        }
      })
    }
  }, [gl, scene])

  return null
}
