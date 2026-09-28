import { use, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Vector2, Vector4, type ShaderMaterial } from 'three'
import { lineupLook, type WordLayer } from './lineup/lineupLook'
import { sceneState } from './sceneState'
import { loadWords, type WordTexture } from './words'

// Фон сцены — как на продуктовом фото: почти белый центр и лёгкий градиент
// по бокам, логотипа позади банки нет. На первом экране цвета ледяные (сняты
// пипеткой с фото), в коллекции у каждого вкуса свои — их плавно смешивает
// lineup/lineupLook.ts. В этом же шейдере живут огромные слова за банкой:
// ULTRA в финале первого экрана и название вкуса в коллекции.
//
// Фон рисуется внутри WebGL, а не CSS-градиентом за прозрачным canvas:
// лёд и капли преломляют то, что находится за ними, а three.js видит только
// объекты сцены. С CSS-фоном кубики льда "преломляли" бы пустоту и темнели.
// По той же причине слова — часть фона, а не отдельные прозрачные плоскости:
// так лёд честно искажает и буквы.
//
// Слов два слоя (A и B): при смене вкуса старое слово гаснет, новое
// проявляется. Полноэкранный прямоугольник сразу в clip-space: камера и
// масштаб на него не влияют, он всегда закрывает весь кадр и рисуется первым.

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
  uniform vec3 uGlow;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform sampler2D uWordA;
  uniform vec4 uWordRectA;
  uniform float uWordOpacityA;
  uniform vec3 uWordColorA;
  uniform sampler2D uWordB;
  uniform vec4 uWordRectB;
  uniform float uWordOpacityB;
  uniform vec3 uWordColorB;
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

  // Слово: маска из текстуры, сверху чуть светлее — "подсвечено"
  vec3 applyWord(vec3 color, sampler2D word, vec4 rect, float opacity, vec3 wordColor) {
    if (opacity < 0.001) return color;
    vec2 wordUv = (vUv - rect.xy) / (2.0 * rect.zw) + 0.5;
    if (wordUv.x < 0.0 || wordUv.x > 1.0 || wordUv.y < 0.0 || wordUv.y > 1.0) return color;
    float mask = texture2D(word, wordUv).r * opacity;
    vec3 lit = mix(wordColor, wordColor * 1.9 + 0.04, smoothstep(0.1, 1.0, wordUv.y) * 0.45);
    return mix(color, lit, mask);
  }

  void main() {
    // Цветные края: сильнее по бокам, слабее сверху-снизу, как на фото
    float side = smoothstep(0.18, 1.0, abs(vUv.x - 0.5) * 2.0);
    float low = smoothstep(0.45, 1.0, 1.0 - vUv.y) * 0.32;
    float edge = clamp(side * 0.92 + low, 0.0, 1.0);
    vec3 color = mix(uCenter, uEdge, edge);
    color = mix(color, uDeep, pow(side, 2.6) * 0.55);

    // Мягкое светлое "сияние" за банкой — центр кадра чуть светлее
    vec2 p = (vUv - vec2(0.5, 0.52)) * vec2(uResolution.x / uResolution.y, 1.0);
    float glow = exp(-dot(p, p) * 3.2);
    color = mix(color, uGlow, glow * 0.3);

    // Медленная дымка — фон живой, но движение на грани заметности
    float haze = valueNoise(vUv * vec2(3.0, 2.0) + vec2(uTime * 0.012, uTime * 0.007));
    color += (haze - 0.5) * 0.014 * edge;

    color = applyWord(color, uWordA, uWordRectA, uWordOpacityA, uWordColorA);
    color = applyWord(color, uWordB, uWordRectB, uWordOpacityB, uWordColorB);

    // Дизеринг: без него на плавном градиенте видны полосы 8-битного цвета
    color += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

interface WordUniforms {
  texture: { value: WordTexture['texture'] }
  rect: { value: Vector4 }
  opacity: { value: number }
  color: { value: Color }
}

// Слой слова → его uniform-ы: текстура нужного слова, прямоугольник на
// экране (центр и половины размеров в долях экрана), прозрачность, цвет.
// Слово стоит по центру сцены (банка оказывается ровно между буквами).
// Высота букв у всех слов одна — как у ULTRA первого экрана; длинное слово
// просто шире, но не шире экрана.
function placeWord(
  target: WordUniforms,
  layer: WordLayer,
  words: WordTexture[],
  letterHeight: number,
  width: number,
  height: number,
) {
  const word = words[layer.index]
  const stage = sceneState.stage.width > 0 ? sceneState.stage : { x: 0, y: 0, width, height }
  const wordWidth = Math.min(letterHeight * word.aspect, width * 0.96)
  const wordHeight = wordWidth / word.aspect
  target.texture.value = word.texture
  target.rect.value.set(
    (stage.x + stage.width / 2) / width + layer.shift,
    1 - (stage.y + stage.height / 2) / height,
    wordWidth / 2 / width,
    wordHeight / 2 / height,
  )
  target.opacity.value = layer.opacity
  target.color.value.copy(layer.color)
}

export function Backdrop() {
  const words = use(loadWords())
  const materialRef = useRef<ShaderMaterial>(null)

  // Параметры материала стабильны на всё время жизни фона; сам материал и
  // плоскость созданы JSX-ом — R3F освободит их при размонтировании
  const parameters = useMemo(
    () => ({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCenter: { value: new Color() },
        uEdge: { value: new Color() },
        uDeep: { value: new Color() },
        uGlow: { value: new Color() },
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uWordA: { value: words[0].texture },
        uWordRectA: { value: new Vector4(0.5, 0.5, 0.3, 0.1) },
        uWordOpacityA: { value: 0 },
        uWordColorA: { value: new Color() },
        uWordB: { value: words[0].texture },
        uWordRectB: { value: new Vector4(0.5, 0.5, 0.3, 0.1) },
        uWordOpacityB: { value: 0 },
        uWordColorB: { value: new Color() },
      },
      depthWrite: false,
      depthTest: false,
    }),
    [words],
  )

  // Слои слов в виде пар "что — куда": собираются один раз, в кадре только
  // меняются значения
  const layers = useMemo(() => {
    const { uniforms } = parameters
    return [
      { texture: uniforms.uWordA, rect: uniforms.uWordRectA, opacity: uniforms.uWordOpacityA, color: uniforms.uWordColorA },
      { texture: uniforms.uWordB, rect: uniforms.uWordRectB, opacity: uniforms.uWordOpacityB, color: uniforms.uWordColorB },
    ] as [WordUniforms, WordUniforms]
  }, [parameters])

  useFrame((state) => {
    const material = materialRef.current
    if (!material) return
    const { width, height } = state.size
    const uniforms = material.uniforms
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uResolution.value.set(width, height)
    uniforms.uCenter.value.copy(lineupLook.center)
    uniforms.uEdge.value.copy(lineupLook.edge)
    uniforms.uDeep.value.copy(lineupLook.deep)
    uniforms.uGlow.value.copy(lineupLook.glow)

    // Высота букв — от ULTRA: большая часть ширины экрана, но не выше
    // разумного на вытянутом экране
    const ultraWidth = Math.min(width * (width > height ? 0.74 : 0.92), height * 2.6)
    const letterHeight = ultraWidth / words[0].aspect
    placeWord(layers[0], lineupLook.words[0], words, letterHeight, width, height)
    placeWord(layers[1], lineupLook.words[1], words, letterHeight, width, height)
  })

  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={materialRef} args={[parameters]} />
    </mesh>
  )
}
