import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  MathUtils,
  Matrix4,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three'
import { motion } from '@/state/motion'
import { CAN_HEIGHT, CAN_RADIUS } from '../can/canDimensions'
import { sceneState } from '../sceneState'
import { createRandom } from '../utils/random'
import { pointerOnGroupPlane } from './pointer'
import { vaporTexture } from './vaporTexture'

// Морозный пар главы «Холод». Холодная банка охлаждает воздух у стенки
// ниже точки росы — он туманится и, тяжёлый, стекает вниз, расползаясь
// в стороны: как в рекламе ледяных напитков. Пар появляется, когда банка
// остыла до холодильника, и густеет к морозу (sceneState.chill).
//
// Клубы — плоские квадраты, всегда смотрящие в камеру (камера неподвижна и
// смотрит вдоль −Z, так что квадрат в плоскости XY — уже «билборд»). Вся
// жизнь клуба — в вершинном шейдере: где родился у стенки, как опускается
// и растёт, когда гаснет; время жизни зациклено, состояние на CPU не нужно.
// Курсор раздвигает пар. Один вызов отрисовки на все клубы.
//
// Висит в группе раскладки рядом с банками коллекции: центр банки главы —
// начало координат группы, масштаб — её масштаб.

const COUNT = 120

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform vec3 uPointer;
  uniform float uPointerOn;
  attribute vec2 aCorner;
  attribute vec4 aSeed;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSpin;

  const float CAN_H = ${CAN_HEIGHT.toFixed(3)};
  const float CAN_R = ${CAN_RADIUS.toFixed(3)};

  void main() {
    float life = mix(3.2, 5.4, aSeed.x);
    float age = fract(uTime / life + aSeed.y);
    float side = aSeed.z < 0.5 ? -1.0 : 1.0;
    float k = fract(aSeed.z * 7.13);

    // Рождается у боковых стенок и чуть позади — там пар виден на фоне неба
    // и не вуалит этикетку; по всей высоте банки, гуще у верха — там
    // холодный металл встречает больше тёплого воздуха. Каждый пятый клуб —
    // у дна: стекает с банки вниз и стелется
    float fromBottom = step(0.8, fract(aSeed.w * 5.9));
    float height = mix(mix(-0.4, 0.45, sqrt(aSeed.w)), -0.48, fromBottom) * CAN_H;
    vec3 pos = vec3(side * CAN_R * mix(mix(0.92, 1.08, k), mix(0.1, 0.9, k), fromBottom), height, mix(-0.5, 0.25, fract(aSeed.w * 13.7)));
    // Холодный воздух тяжелее — опускается, разгоняясь, и чуть отходит от
    // стенки, закручиваясь; у дна — растекается в стороны
    float drift = mix(mix(0.06, 0.28, fract(aSeed.x * 5.3)), mix(0.4, 1.1, fract(aSeed.x * 5.3)), fromBottom);
    pos.x += side * drift * age;
    pos.y -= mix(mix(0.7, 1.25, fract(aSeed.y * 3.1)), 0.28, fromBottom) * (0.3 * age + 1.9 * age * age);
    pos.x += sin(uTime * 0.7 + aSeed.y * 20.0 + age * 3.0) * 0.06 * age;

    // Курсор раздвигает пар
    vec2 away = pos.xy - uPointer.xy;
    float near = exp(-dot(away, away) * 2.0) * uPointerOn;
    pos.xy += normalize(away + vec2(1e-4)) * near * 0.6;

    // Струя вытягивается вниз, пока падает; у дна — расплывается вширь
    float size = mix(0.22, 0.85, age) * mix(0.75, 1.3, fract(aSeed.x * 11.0)) * mix(1.0, 1.6, fromBottom);
    float stretch = mix(mix(1.0, 2.6, age), mix(1.0, 0.55, age), fromBottom);
    vec3 corner = pos + vec3(aCorner * size * vec2(1.0, stretch), 0.0);
    vAlpha = uAmount * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.4, 1.0, age)) * (1.0 - 0.6 * near);
    vUv = aCorner + 0.5;
    vSpin = (aSeed.w - 0.5) * 0.9 + uTime * 0.08 * (aSeed.x - 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(corner, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uSmoke;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSpin;

  void main() {
    // Поворот — лишь чуть-чуть: вытянутая струя должна идти вниз, а не вбок
    vec2 c = vUv - 0.5;
    float s = sin(vSpin);
    float co = cos(vSpin);
    vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
    float a = texture2D(uSmoke, uv).r * vAlpha;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`

// Клубы — четыре вершины на клуб, своё зерно у каждого
function createVaporGeometry(): BufferGeometry {
  const random = createRandom(1717)
  const positions = new Float32Array(COUNT * 4 * 3)
  const corners = new Float32Array(COUNT * 4 * 2)
  const seeds = new Float32Array(COUNT * 4 * 4)
  const indices = new Uint16Array(COUNT * 6)
  const quad = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]
  for (let i = 0; i < COUNT; i++) {
    const seed = [random(), random(), random(), random()]
    for (let v = 0; v < 4; v++) {
      const vertex = i * 4 + v
      corners.set(quad[v], vertex * 2)
      seeds.set(seed, vertex * 4)
    }
    indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
  }
  const geometry = new BufferGeometry()
  // Позиции не нужны шейдеру (всё считает он сам), но three ждёт атрибут position
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aCorner', new BufferAttribute(corners, 2))
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4))
  geometry.setIndex(new BufferAttribute(indices, 1))
  return geometry
}

function createVaporMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uPointer: { value: new Vector3(99, 99, 0) },
      uPointerOn: { value: 0 },
      uSmoke: { value: vaporTexture() },
      // Холодный белый с голубизной — пар подсвечен ночным небом
      uColor: { value: new Color('#d6ebff') },
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  })
}

// Пар густеет от холодильника к морозу; в пике клуб полупрозрачный —
// плотным пар делают наложения клубов
const PEAK_ALPHA = 0.22

const frame = { inverse: new Matrix4(), pointer: new Vector3(), target: new Vector3(99, 99, 0) }

// Изменения материала — функцией уровня модуля: объект создан в useMemo,
// а меняется из кадра (правило oxlint immutability)
function updateVapor(material: ShaderMaterial, mesh: Mesh, amount: number, time: number, pointerOn: number, delta: number) {
  mesh.visible = amount > 0.002
  if (!mesh.visible) return
  const u = material.uniforms
  u.uAmount.value = amount * PEAK_ALPHA
  if (!motion.reducedMotion) u.uTime.value = time
  ;(u.uPointer.value as Vector3).lerp(frame.target, 1 - Math.exp(-delta * 6))
  u.uPointerOn.value = MathUtils.damp(u.uPointerOn.value, pointerOn, 4, delta)
}

export function ColdVapor() {
  const meshRef = useRef<Mesh>(null)
  const geometry = useMemo(() => createVaporGeometry(), [])
  const material = useMemo(() => createVaporMaterial(), [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    // Пар — только ночью, пока банка главы на месте: от холодильника к морозу
    const amount = sceneState.coldAir * MathUtils.smoothstep(sceneState.chill, 0.25, 1)
    let pointerOn = 0
    if (amount > 0.002 && mesh.parent) {
      mesh.parent.updateWorldMatrix(true, false)
      if (pointerOnGroupPlane(state.raycaster, state.camera, mesh.parent, frame.inverse, frame.pointer)) {
        frame.target.copy(frame.pointer)
        pointerOn = 1
      }
    }
    updateVapor(material, mesh, amount, state.clock.elapsedTime, pointerOn, delta)
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={2} dispose={null} />
}
