import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, MathUtils, Matrix4, ShaderMaterial, Vector3, type Points } from 'three'
import { motion } from '@/state/motion'
import { sceneState } from '../sceneState'
import { createRandom, randomRange } from '../utils/random'
import { pointerOnGroupPlane } from './pointer'

// Ледяная пыль главы «Холод» — «алмазная пыль», как в морозную ночь:
// мельчайшие кристаллы льда висят в воздухе, медленно оседают и вспыхивают,
// поймав свет. Появляется ниже нуля, вместе с инеем на банке.
//
// Частицы — точки в коробке вокруг банки (впереди и позади неё — глубина),
// падение и покачивание — в вершинном шейдере, по зерну частицы. Каждая
// изредка «вспыхивает»: точка растёт и показывает четыре луча, как блик на
// грани кристалла. Курсор отгоняет пыль. Свечение складывается (additive) —
// на ночном небе вспышки светятся, а не закрывают его.

const COUNT = 340
// Коробка вокруг банки, ед. группы раскладки
const BOX = { x: 3.6, y: 2.7, zFrom: -2.4, zTo: 2.8 }

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform float uPixelRatio;
  uniform vec3 uPointer;
  uniform float uPointerOn;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying float vGlint;

  const float HALF_H = ${BOX.y.toFixed(2)};

  void main() {
    vec3 p = position;
    // Оседает медленно и бесконечно: выпав снизу коробки, снова сверху
    float fall = mix(0.05, 0.17, aSeed.x);
    p.y = mod(p.y - uTime * fall + HALF_H, 2.0 * HALF_H) - HALF_H;
    p.x += sin(uTime * mix(0.18, 0.45, aSeed.y) + aSeed.z * 30.0) * 0.14;
    p.z += cos(uTime * 0.27 + aSeed.w * 20.0) * 0.1;

    vec2 away = p.xy - uPointer.xy;
    float near = exp(-dot(away, away) * 3.0) * uPointerOn;
    p.xy += normalize(away + vec2(1e-4)) * near * 0.45;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // Редкая вспышка: острый пик синуса
    vGlint = pow(max(0.0, sin(uTime * mix(0.9, 2.6, aSeed.y) + aSeed.w * 47.0)), 16.0);
    gl_PointSize = (mix(1.8, 3.6, aSeed.z) + vGlint * 14.0) * uPixelRatio * (16.0 / max(-mv.z, 1.0));
    // У верхнего и нижнего края коробки частица тает, а не обрывается
    float edge = 1.0 - smoothstep(HALF_H - 0.5, HALF_H, abs(p.y));
    vAlpha = uAmount * edge * mix(0.45, 1.0, aSeed.y);
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vGlint;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float core = exp(-dot(c, c) * 70.0);
    // Четыре луча — блик на грани кристалла
    float rays = (exp(-abs(c.x) * 38.0) * exp(-abs(c.y) * 5.0) + exp(-abs(c.y) * 38.0) * exp(-abs(c.x) * 5.0)) * vGlint;
    float a = (core + rays * 0.9) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vec3(0.78, 0.9, 1.0), a);
    #include <colorspace_fragment>
  }
`

function createDustGeometry(): BufferGeometry {
  const random = createRandom(4242)
  const positions = new Float32Array(COUNT * 3)
  const seeds = new Float32Array(COUNT * 4)
  for (let i = 0; i < COUNT; i++) {
    positions.set([randomRange(random, -BOX.x, BOX.x), randomRange(random, -BOX.y, BOX.y), randomRange(random, BOX.zFrom, BOX.zTo)], i * 3)
    seeds.set([random(), random(), random(), random()], i * 4)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4))
  return geometry
}

function createDustMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uPixelRatio: { value: 1 },
      uPointer: { value: new Vector3(99, 99, 0) },
      uPointerOn: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

const frame = { inverse: new Matrix4(), pointer: new Vector3(), target: new Vector3(99, 99, 0) }

// Изменения материала — функцией уровня модуля (правило oxlint immutability)
function updateDust(material: ShaderMaterial, points: Points, amount: number, time: number, dpr: number, pointerOn: number, delta: number) {
  points.visible = amount > 0.002
  if (!points.visible) return
  const u = material.uniforms
  u.uAmount.value = amount
  u.uPixelRatio.value = dpr
  if (!motion.reducedMotion) u.uTime.value = time
  ;(u.uPointer.value as Vector3).lerp(frame.target, 1 - Math.exp(-delta * 6))
  u.uPointerOn.value = MathUtils.damp(u.uPointerOn.value, pointerOn, 4, delta)
}

export function DiamondDust() {
  const pointsRef = useRef<Points>(null)
  const geometry = useMemo(() => createDustGeometry(), [])
  const material = useMemo(() => createDustMaterial(), [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state, delta) => {
    const points = pointsRef.current
    if (!points) return
    // Пыль — только ночью и ниже нуля: chill 0.78 — это 0 °C
    const amount = sceneState.coldAir * MathUtils.smoothstep(sceneState.chill, 0.76, 0.98)
    let pointerOn = 0
    if (amount > 0.002 && points.parent) {
      points.parent.updateWorldMatrix(true, false)
      if (pointerOnGroupPlane(state.raycaster, state.camera, points.parent, frame.inverse, frame.pointer)) {
        frame.target.copy(frame.pointer)
        pointerOn = 1
      }
    }
    updateDust(material, points, amount, state.clock.elapsedTime, state.gl.getPixelRatio(), pointerOn, delta)
  })

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} visible={false} renderOrder={3} dispose={null} />
}
