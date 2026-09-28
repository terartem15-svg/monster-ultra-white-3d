import { use, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MathUtils, Vector2, Vector4, type ShaderMaterial } from 'three'
import { PHASES } from '@/animations/scrollPhases'
import { motion } from '@/state/motion'
import { loadOutroWord } from './outroWord'
import { sceneState } from './sceneState'

// Фон сцены — как на продуктовом фото: почти белый центр и лёгкий голубой
// градиент по бокам (цвета сняты пипеткой с фото), логотипа позади банки нет.
// В этом же шейдере в финале скролла проявляется огромное слово ULTRA.
//
// Фон рисуется внутри WebGL, а не CSS-градиентом за прозрачным canvas:
// лёд и капли преломляют то, что находится за ними, а three.js видит только
// объекты сцены. С CSS-фоном кубики льда "преломляли" бы пустоту и темнели.
// По той же причине слово — часть фона, а не отдельная прозрачная плоскость:
// так лёд честно искажает и буквы.
//
// Полноэкранный прямоугольник сразу в clip-space: камера и масштаб на него
// не влияют, он всегда закрывает весь кадр и рисуется первым.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uCenter;
  uniform vec3 uEdge;
  uniform vec3 uDeep;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform sampler2D uWord;
  uniform vec4 uWordRect;
  uniform float uWordOpacity;
  uniform vec3 uWordColor;
  varying vec2 vUv;

  // Дешёвый шум для едва заметной "морозной дымки" и дизеринга
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    // Голубые края: сильнее по бокам, слабее сверху-снизу, как на фото
    float side = smoothstep(0.18, 1.0, abs(vUv.x - 0.5) * 2.0);
    float low = smoothstep(0.45, 1.0, 1.0 - vUv.y) * 0.32;
    float edge = clamp(side * 0.92 + low, 0.0, 1.0);
    vec3 color = mix(uCenter, uEdge, edge);
    color = mix(color, uDeep, pow(side, 2.6) * 0.55);

    // Мягкое светлое "сияние" за банкой — центр кадра чуть светлее
    vec2 p = (vUv - vec2(0.5, 0.52)) * vec2(uResolution.x / uResolution.y, 1.0);
    float glow = exp(-dot(p, p) * 3.2);
    color = mix(color, vec3(1.0), glow * 0.3);

    // Медленная дымка — фон живой, но движение на грани заметности
    float haze = valueNoise(vUv * vec2(3.0, 2.0) + vec2(uTime * 0.012, uTime * 0.007));
    color += (haze - 0.5) * 0.014 * edge;

    // Слово финала: маска из текстуры, сверху чуть светлее — "подсвечено"
    if (uWordOpacity > 0.001) {
      vec2 wordUv = (vUv - uWordRect.xy) / (2.0 * uWordRect.zw) + 0.5;
      if (wordUv.x >= 0.0 && wordUv.x <= 1.0 && wordUv.y >= 0.0 && wordUv.y <= 1.0) {
        float mask = texture2D(uWord, wordUv).r * uWordOpacity;
        vec3 wordColor = mix(uWordColor, uWordColor * 1.9 + 0.04, smoothstep(0.1, 1.0, wordUv.y) * 0.45);
        color = mix(color, wordColor, mask);
      }
    }

    // Дизеринг: без него на плавном градиенте видны полосы 8-битного цвета
    color += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

export function Backdrop() {
  const word = use(loadOutroWord())
  const materialRef = useRef<ShaderMaterial>(null)

  // Параметры материала стабильны на всё время жизни фона; сам материал и
  // плоскость созданы JSX-ом — R3F освободит их при размонтировании
  const parameters = useMemo(
    () => ({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCenter: { value: new Color('#f5f9fd') },
        uEdge: { value: new Color('#d3e5f1') },
        uDeep: { value: new Color('#b2cfe2') },
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uWord: { value: word.texture },
        uWordRect: { value: new Vector4(0.5, 0.5, 0.3, 0.1) },
        uWordOpacity: { value: 0 },
        uWordColor: { value: new Color('#0e2233') },
      },
      depthWrite: false,
      depthTest: false,
    }),
    [word],
  )

  useFrame((state) => {
    const material = materialRef.current
    if (!material) return
    const { width, height } = state.size
    const uniforms = material.uniforms
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uResolution.value.set(width, height)

    // Слово стоит по центру слота банки: банка оказывается ровно между
    // буквами. Ширина — большая часть экрана, высота — из пропорций букв.
    const slot = motion.slot.width > 0 ? motion.slot : { x: 0, y: 0, width, height }
    const wordWidth = Math.min(width * (width > height ? 0.74 : 0.92), height * 2.6)
    const wordHeight = wordWidth / word.aspect
    uniforms.uWordRect.value.set(
      (slot.x + slot.width / 2) / width,
      1 - (slot.y + slot.height / 2) / height,
      wordWidth / 2 / width,
      wordHeight / 2 / height,
    )
    // Слово проявляется в финале, когда банка вернулась из сцены деталей
    uniforms.uWordOpacity.value = MathUtils.smoothstep(sceneState.scroll, PHASES.word[0], PHASES.word[1])
  })

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={materialRef} args={[parameters]} />
    </mesh>
  )
}
