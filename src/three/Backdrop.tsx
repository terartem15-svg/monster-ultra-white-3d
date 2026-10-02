import { use, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, MathUtils, Vector2, Vector3, Vector4, type ShaderMaterial } from 'three'
import { motion } from '@/state/motion'
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
//
// Здесь же — небо главы «Холод»: полярная ночь поверх тёмных цветов фона.
// Холодное свечение горизонта за банкой, редкие звёзды, северное сияние в
// ледяных тонах (разгорается по мере того, как банка остывает), туман,
// стелющийся у нижнего края, и виньетка. Всё это считается только ночью
// (uNight > 0), в остальных главах ветка не выполняется.

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
  uniform float uNight;
  uniform float uChill;
  uniform float uNightTime;
  uniform vec2 uHalo;
  uniform vec3 uFloor;
  uniform vec2 uParallax;
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

  float fbm3(vec2 p) {
    float v = 0.5 * valueNoise(p);
    v += 0.25 * valueNoise(p * 2.03 + 17.1);
    v += 0.125 * valueNoise(p * 4.07 + 31.7);
    return v / 0.875;
  }

  // Звёзды: по звезде на редкую ячейку сетки, мерцают каждая в своём ритме
  float stars(vec2 p, float density, float t) {
    vec2 cell = floor(p * density);
    vec2 local = fract(p * density);
    float h = hash(cell);
    if (h < 0.965) return 0.0;
    vec2 at = vec2(hash(cell + 7.1), hash(cell + 3.7)) * 0.7 + 0.15;
    float size = mix(0.05, 0.14, hash(cell + 1.3));
    float twinkle = 0.55 + 0.45 * sin(t * mix(0.6, 1.8, hash(cell + 5.9)) + h * 40.0);
    return (1.0 - smoothstep(0.0, size, length(local - at))) * twinkle;
  }

  // Полоса северного сияния — занавес: резкий нижний край, затухание вверх,
  // частые вертикальные лучи-складки; край медленно волнуется
  float auroraBand(vec2 p, float t, float base, float seed) {
    float wave = 0.05 * sin(p.x * 1.5 + t * 0.06 + seed) + 0.028 * sin(p.x * 3.6 - t * 0.09 + seed * 2.0);
    wave += (fbm3(vec2(p.x * 1.2 + seed, t * 0.025)) - 0.5) * 0.12;
    float d = p.y - (base + wave);
    float lower = smoothstep(-0.006, 0.01, d);
    float upper = exp(-max(d, 0.0) * 6.5);
    float rays = fbm3(vec2(p.x * 22.0 + seed * 3.0 + t * 0.05, d * 0.6));
    rays = pow(smoothstep(0.3, 0.85, rays), 1.6) * 1.6 + 0.12;
    float fine = 0.75 + 0.25 * sin(p.x * 140.0 + seed * 9.0 + fbm3(vec2(p.x * 9.0, t * 0.1)) * 6.0);
    float extent = 1.0 - smoothstep(0.3, 1.2, abs(p.x - 0.22 * sin(seed * 1.7)));
    return lower * upper * rays * fine * extent;
  }

  // Цвета ночи (линейные; в sRGB — #050b18, #0b1d38, #143a63, #07111f)
  const vec3 NIGHT_TOP = vec3(0.0015, 0.0033, 0.0091);
  const vec3 NIGHT_MID = vec3(0.0033, 0.0123, 0.04);
  const vec3 NIGHT_HORIZON = vec3(0.007, 0.0423, 0.125);
  const vec3 NIGHT_FLOOR = vec3(0.0021, 0.0056, 0.0137);

  vec3 nightSky(vec2 uv) {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
    float t = uNightTime;
    float h = uv.y - 0.34;

    // Небо: у горизонта — глубокий синий, вверх — почти чёрный; ниже
    // горизонта — тёмный «пол». Свечение горизонта сильнее в центре, за банкой
    vec3 color = mix(NIGHT_MID, NIGHT_TOP, smoothstep(0.08, 0.6, h));
    color = mix(color, NIGHT_FLOOR, smoothstep(0.0, 0.32, -h));
    float center = 1.0 - 0.7 * smoothstep(0.0, 1.1, abs(p.x));
    color += NIGHT_HORIZON * exp(-h * h / 0.012) * center * (0.55 + 0.45 * uChill);

    // Ореол за банкой — силуэт отделяется от неба
    vec2 halo = (uv - uHalo) * vec2(aspect, 1.0);
    color += vec3(0.006, 0.03, 0.075) * exp(-dot(halo, halo) * 5.5);

    // Холодный световой «пол» под банкой — эллипс, как пятно от софтбокса:
    // банка стоит в луче, а не висит в пустоте
    vec2 floorAt = (uv - uFloor.xy) / vec2(uFloor.z, uFloor.z * 0.16);
    color += vec3(0.01, 0.045, 0.1) * exp(-dot(floorAt, floorAt) * 1.6) * (0.6 + 0.4 * uChill);

    // Параллакс за курсором: дальние слои (звёзды) сдвигаются меньше
    // ближних (сияние, туман) — у ночи появляется глубина
    vec2 pStars = p + uParallax * 0.006;
    vec2 pAurora = p + uParallax * 0.018;

    // Звёзды — в верхней части неба
    float sky = smoothstep(0.1, 0.4, h);
    float star = stars(pStars, 70.0, t) + 0.6 * stars(pStars + 11.3, 130.0, t * 1.3);
    color += vec3(0.32, 0.42, 0.62) * star * sky;

    // Северное сияние: две занавеси, внизу ледяной циан, выше — в синеву с
    // фиолетом. Разгорается, когда банка остывает
    float glow = 0.3 + 0.7 * uChill;
    float a1 = auroraBand(pAurora, t, 0.6, 1.3);
    float a2 = auroraBand(pAurora * vec2(0.82, 1.0) + vec2(0.45, 0.0), t * 0.8, 0.72, 4.1);
    vec3 low = vec3(0.012, 0.13, 0.17);
    vec3 high = vec3(0.025, 0.018, 0.12);
    color += mix(low, high, smoothstep(0.6, 0.95, uv.y)) * a1 * glow;
    color += mix(low * 0.8, high, smoothstep(0.7, 1.0, uv.y)) * a2 * glow * 0.65;

    // Туман у нижнего края: стелется клочьями и медленно ползёт
    float fogShape = 1.0 - smoothstep(0.0, 0.3, uv.y);
    float fog = fogShape * smoothstep(0.35, 0.85, fbm3(vec2(p.x * 1.4 + uParallax.x * 0.035 + t * 0.03, uv.y * 3.5 - t * 0.01)));
    color += vec3(0.012, 0.024, 0.042) * fog * (0.5 + 0.8 * uChill);

    // Виньетка: углы уходят в черноту, взгляд — к банке
    float vignette = smoothstep(0.5, 1.3, length((uv - vec2(0.5, 0.46)) * vec2(aspect, 1.0)));
    return color * (1.0 - 0.6 * vignette);
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

    if (uNight > 0.001) color = mix(color, nightSky(vUv), uNight);

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
  // Сцена не по центру (телефон лёжа: банка справа от плашки) — слово
  // сдвигается внутрь экрана, а не уходит за край
  const half = wordWidth / 2
  const centerX = MathUtils.clamp(stage.x + stage.width / 2, Math.min(half, width / 2), Math.max(width - half, width / 2))
  target.texture.value = word.texture
  target.rect.value.set(
    centerX / width + layer.shift,
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
        uNight: { value: 0 },
        uChill: { value: 0 },
        uNightTime: { value: 0 },
        uHalo: { value: new Vector2(0.5, 0.5) },
        uFloor: { value: new Vector3(0.5, 0.2, 0.2) },
        uParallax: { value: new Vector2() },
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

  useFrame((state, delta) => {
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
    // Ночное небо «Холода»; при "уменьшить движение" сияние, звёзды и туман
    // замирают — это декоративное движение
    uniforms.uNight.value = sceneState.dark
    uniforms.uChill.value = sceneState.chill
    if (!motion.reducedMotion) uniforms.uNightTime.value = state.clock.elapsedTime
    // Ореол — за центром сцены, где стоит банка; «пол» — под её дном
    const stage = sceneState.stage
    if (stage.width > 0) {
      uniforms.uHalo.value.set((stage.x + stage.width / 2) / width, 1 - (stage.y + stage.height / 2) / height)
      uniforms.uFloor.value.set((stage.x + stage.width / 2) / width, 1 - (stage.y + stage.height * 0.9) / height, (stage.height * 0.42) / height)
    }
    // Параллакс — за курсором с инерцией; без движения и без мыши — на месте
    const follow = motion.pointerActive && !motion.reducedMotion
    const parallax = uniforms.uParallax.value
    parallax.x = MathUtils.damp(parallax.x, follow ? motion.pointer.x : 0, 2, delta)
    parallax.y = MathUtils.damp(parallax.y, follow ? motion.pointer.y : 0, 2, delta)

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
