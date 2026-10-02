import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type MeshPhysicalMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { COLD_PHYSICS } from '@/content/cold'
import { smoothstep } from '@/utils/smoothstep'
import { CAN_HEIGHT, CAN_RADIUS } from '../canDimensions'
import { GLASS_ALPHA, GLASS_INK, GLASS_PARS, glassUniforms } from '../glass'
import { DROPLET_GROW, P_RANGE, TRAIL_BOTTOM, buildDropletField, createDropletLayout } from './droplets'
import { GRAIN_SIZE, buildFrostField } from './frost'

// Состояние поверхности банки — от сухой до заиндевевшей — поверх любой
// этикетки. Этикетки (Ultra White и вкусы коллекции) теперь «сухие», а
// конденсат и иней добавляет шейдер материала этикетки: onBeforeCompile
// дописывает в стандартный MeshPhysicalMaterial чтение трёх общих текстур
// (поле капель — droplets.ts, «приход» инея и зерно кристаллов — frost.ts)
// и три числа состояния:
//  - uColdWetness 0..1 — влажность: 0 — сухо; дальше банка запотевает, и
//    капли зарождаются точками и растут до полного размера к 1;
//  - uColdTrails 0..TRAILS_FULL — «прокат»: крупные капли скатываются и
//    открывают мокрые дорожки сверху вниз;
//  - uColdFrostLevel 0..1 — иней: фронт идёт от горлышка и каблука внутрь,
//    капли замерзают в белёсые бусины.
//
// Все материалы этикеток делят одни и те же uniform-объекты и один ключ
// программы: у всех банок одинаковое состояние и один скомпилированный
// шейдер — смена банки по-прежнему без компиляции.
//
// В тот же патч встроено «стекло» главы «Состав» (../glass.ts): оно работает
// только у прозрачной версии материала и опирается на переменные этого
// патча — капли и иней остаются видны и на стеклянной банке.

// --- Состояния ------------------------------------------------------------------------

// «Прокат» дорожек целиком: чуть больше 1, чтобы открылись и мягкие края следа
export const TRAILS_FULL = 1.25
// Банка первого экрана и коллекции — «только из холодильника»: в каплях, с
// дорожками и с инеем только на металле горлышка и каблука, как раньше
export const FROST_BASE = 0.12

// --- Текстуры -------------------------------------------------------------------------

// Зерно кристаллов повторяется по окружности целое число раз (иначе шов) и
// по высоте так, чтобы грани остались круглыми, а не вытянутыми
const GRAIN_REPEAT_U = 8
const GRAIN_REPEAT_V = Math.round((GRAIN_REPEAT_U * CAN_HEIGHT) / (Math.PI * 2 * CAN_RADIUS))

// Поле капель — без мип-уровней: усреднение координат соседних капель
// рождало бы несуществующие капли. «Приход» инея и зерно — с мип-уровнями:
// вдали фронт и грани мягко усредняются
function dataTexture(data: Uint8Array, width: number, height: number, red: boolean, mipmaps: boolean): DataTexture {
  const texture = new DataTexture(data, width, height, red ? RedFormat : RGBAFormat, UnsignedByteType)
  texture.colorSpace = NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = mipmaps ? LinearMipmapLinearFilter : LinearFilter
  texture.generateMipmaps = mipmaps
  texture.needsUpdate = true
  return texture
}

export const coldUniforms = {
  uColdDroplets: { value: null as Texture | null },
  uColdFrost: { value: null as Texture | null },
  uColdGrain: { value: null as Texture | null },
  uColdGrainRepeat: { value: new Vector2(GRAIN_REPEAT_U, GRAIN_REPEAT_V) },
  uColdWetness: { value: 1 },
  uColdTrails: { value: TRAILS_FULL },
  uColdFrostLevel: { value: FROST_BASE },
}

// Карты строятся один раз на всё приложение (~0.1–0.2 с процессора, пока
// висит прелоадер) и живут столько же, сколько страница — как этикетка
// первого экрана. Промис кэшируется: его ждёт SlicedCan через use()
let mapsPromise: Promise<void> | null = null

export function loadColdSurface(): Promise<void> {
  mapsPromise ??= Promise.resolve().then(() => {
    const layout = createDropletLayout()
    const droplets = buildDropletField(layout)
    // Иней расходится пятнами вокруг крупных капель
    const seeds = layout.droplets.filter((drop) => drop.r > 9)
    const frost = buildFrostField(seeds)
    coldUniforms.uColdDroplets.value = dataTexture(droplets.data, droplets.width, droplets.height, false, false)
    coldUniforms.uColdFrost.value = dataTexture(frost.arrival, frost.width, frost.height, true, true)
    const grain = dataTexture(frost.grain, GRAIN_SIZE, GRAIN_SIZE, false, true)
    grain.wrapT = RepeatWrapping
    coldUniforms.uColdGrain.value = grain
  })
  return mapsPromise
}

export function setColdSurface(wetness: number, trails: number, frost: number) {
  coldUniforms.uColdWetness.value = wetness
  coldUniforms.uColdTrails.value = trails
  coldUniforms.uColdFrostLevel.value = frost
}

// --- Состояние по температуре (глава «Холод») -------------------------------------------

// Капли растут от точки росы до полного размера к 4 °C; крупные скатываются
// и оставляют дорожки между 5 и 2.2 °C — к остановке «2 °C» банка в каплях
// целиком. Иней — от 0 °C до −4 °C
const BEADED = 4
const TRAILS_RUN: [number, number] = [5, 2.2]
const FROSTED = -4
// Иней на последней остановке: при полном уровне банку занесло бы почти
// целиком, а коготь и надпись должны читаться
const FROST_MAX = 0.8

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

// dry — насколько банка уже «согрелась» до начала главы: 0 — ещё банка
// коллекции (из холодильника, как на первом экране), 1 — дальше всё решает
// температура
export function updateColdSurface(dry: number, temperature: number) {
  const wetness = smoothstep(temperature, COLD_PHYSICS.dewPoint, BEADED)
  const trails = TRAILS_FULL * smoothstep(temperature, TRAILS_RUN[0], TRAILS_RUN[1])
  const frost = FROST_MAX * smoothstep(temperature, COLD_PHYSICS.freezing, FROSTED)
  setColdSurface(lerp(1, wetness, dry), lerp(TRAILS_FULL, trails, dry), lerp(FROST_BASE, frost, dry))
}

// --- Шейдер -----------------------------------------------------------------------------
//
// Вставки в стандартный фрагментный шейдер MeshPhysicalMaterial (three 0.186).
// Все переменные с префиксом cold — чтобы не столкнуться с переменными three.
// Патч рассчитан на материал этикетки: у него есть map, normalMap и
// clearcoatNormalMap (canMaterials.ts).

const f = (value: number) => value.toFixed(4)

const PARS = /* glsl */ `
uniform sampler2D uColdDroplets;
uniform sampler2D uColdFrost;
uniform sampler2D uColdGrain;
uniform vec2 uColdGrainRepeat;
uniform float uColdWetness;
uniform float uColdTrails;
uniform float uColdFrostLevel;
`

// Вместо map_fragment: сначала состояние поверхности в этой точке, потом
// цвет этикетки (под каплей — со сдвигом-линзой) и всё, что лежит поверх
const MAP = /* glsl */ `
// --- Капли: где пиксель в своей капле и насколько она выросла
vec4 coldField = texture2D( uColdDroplets, vMapUv );
vec2 coldP = coldField.rg * ${f(2 * P_RANGE)} - ${f(P_RANGE)};
float coldGrow = clamp( ( uColdWetness - coldField.b ) / ${f(DROPLET_GROW)}, 0.0, 1.0 );
vec2 coldQ = coldP / max( coldGrow, 0.001 );
float coldQLength = length( coldQ );
// Край сглаживается по экранной ширине пикселя; капля радиусом меньше
// двух пикселей гаснет — она бы только мерцала при повороте банки и
// читалась квадратиком, а не каплей. Ширина не бывает нулевой: вне капель
// поле постоянно, а smoothstep с равными краями в GLSL не определён (NaN
// на части видеокарт)
float coldEdge = max( fwidth( coldQLength ), 0.0001 );
float coldDrop = ( 1.0 - smoothstep( 1.0 - coldEdge, 1.0 + coldEdge, coldQLength ) ) * step( 0.0001, coldGrow );
coldDrop *= 1.0 - smoothstep( 0.5, 1.1, coldEdge );

// Купол воды — наклон поверхности в касательном пространстве: верх пологий,
// край крутой (угол смачивания ~70°), вода оседает — низ капли полнее
vec2 coldQs = coldQ / max( coldQLength, 1.0 );
float coldQ2 = dot( coldQs, coldQs );
vec2 coldSlope = coldQs * inversesqrt( max( 1.0 - coldQ2, 0.06 ) ) * 0.62;
coldSlope.y += 0.16 * ( 1.0 - coldQ2 );

// Капля — линза: этикетка под ней видна увеличенной. Радиус капли в долях
// развёртки — из экранных производных: внутри капли p меняется линейно
vec2 coldUvPerP = vec2(
  length( vec2( dFdx( vMapUv.x ), dFdy( vMapUv.x ) ) ) / max( length( vec2( dFdx( coldP.x ), dFdy( coldP.x ) ) ), 0.0001 ),
  length( vec2( dFdx( vMapUv.y ), dFdy( vMapUv.y ) ) ) / max( length( vec2( dFdx( coldP.y ), dFdy( coldP.y ) ) ), 0.0001 )
);
vec2 coldRefract = clamp( - coldQs * coldGrow * coldUvPerP * 0.3, - 0.004, 0.004 ) * coldDrop;

// --- Дорожки: s — место вдоль следа (0 — верх, 1 — у капли); след
// открывается сверху вниз, как если бы капля только что скатилась
float coldTrailS = ( 1.0 - coldField.a ) / ${f(1 - TRAIL_BOTTOM)};
float coldTrail = smoothstep( 0.02, 0.15, coldField.a ) * clamp( ( uColdTrails - coldTrailS ) * 5.0, 0.0, 1.0 );
coldTrail *= smoothstep( 0.6, 0.95, uColdWetness );

// --- Иней: фронт пришёл сюда, если «приход» меньше текущего уровня; чем
// раньше пришёл, тем гуще. Фронт сглажен по ширине пикселя
float coldArrival = texture2D( uColdFrost, vMapUv ).r;
float coldReach = uColdFrostLevel * 0.9;
float coldFront = max( fwidth( coldArrival ) * 1.5, 0.004 );
float coldCover = smoothstep( coldArrival - coldFront, coldArrival + coldFront, coldReach );
vec4 coldGrain = texture2D( uColdGrain, vMapUv * uColdGrainRepeat );
float coldAge = clamp( ( coldReach - coldArrival ) / 0.4, 0.0, 1.0 );
float coldFrost = coldCover * mix( 0.3, 0.9, coldAge ) * coldGrain.a;

// Капли замерзают, когда иней пошёл по банке. До этого жидкая капля лежит
// поверх тонкого инея на горлышке (банка только из холодильника), а не под ним
float coldFrozen = smoothstep( 0.2, 0.55, uColdFrostLevel );
float coldLiquid = coldDrop * ( 1.0 - coldFrozen );
coldFrost *= 1.0 - coldLiquid;
// Запотевание: пока капли только зарождаются, поверхность между ними
// покрыта мельчайшей росой — лак теряет зеркальность
float coldMist = smoothstep( 0.0, 0.2, uColdWetness ) * ( 1.0 - smoothstep( 0.45, 0.9, uColdWetness ) );
coldMist *= ( 1.0 - coldDrop ) * ( 1.0 - coldCover );

#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv + coldRefract );
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  diffuseColor *= sampledDiffuseColor;
#endif
${GLASS_INK}

// Мокрая краска на дорожке чуть темнее
diffuseColor.rgb *= 1.0 - 0.1 * coldTrail;
// Жидкая капля: тёмная кайма по краю (там свет уходит внутрь воды), блик
// сверху-слева и светлое «донышко» снизу — капля фокусирует свет. Кайма
// узкая и заметная: на белой краске по ней в первую очередь и видно каплю
float coldRim = smoothstep( 0.62, 0.98, coldQLength );
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.34, 0.47, 0.6 ), coldRim * 0.62 * coldLiquid );
vec2 coldGlintQ = ( coldQs - vec2( - 0.32, 0.4 ) ) * vec2( 3.8, 5.0 );
vec2 coldCausticQ = ( coldQs - vec2( 0.08, - 0.52 ) ) * vec2( 2.0, 4.2 );
float coldLight = exp( - dot( coldGlintQ, coldGlintQ ) ) + exp( - dot( coldCausticQ, coldCausticQ ) ) * 0.4;
diffuseColor.rgb += ( 1.0 - diffuseColor.rgb ) * min( coldLight, 1.0 ) * coldLiquid;
// Замёрзшая капля — глянцевая ледяная бусина с белёсой сердцевиной
float coldCore = 1.0 - smoothstep( 0.2, 0.85, coldQLength );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.84, 0.9, 0.95 ), coldDrop * coldFrozen * ( 0.12 + 0.3 * coldCore ) );
// Роса и иней — белёсые слои поверх; сквозь тонкий иней видна краска
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.94 ), coldMist * 0.12 );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.94, 0.99 ) * coldGrain.a, coldFrost * 0.9 );
`

// После roughnessmap_fragment: вода гладкая, роса матовая, иней матовый,
// кроме редких зеркальных граней — они и вспыхивают
const ROUGHNESS = /* glsl */ `
roughnessFactor = mix( roughnessFactor, mix( 0.04, 0.16, coldFrozen ), coldDrop );
roughnessFactor = mix( roughnessFactor, 0.06, coldTrail );
roughnessFactor = min( 1.0, roughnessFactor + coldMist * 0.18 );
roughnessFactor = mix( roughnessFactor, mix( 0.82, 0.16, coldGrain.b ), coldFrost );
`

// После metalnessmap_fragment: вода и лёд — не металл
const METALNESS = /* glsl */ `
metalnessFactor *= ( 1.0 - 0.7 * coldDrop ) * ( 1.0 - coldFrost );
`

// Вместо normal_fragment_maps (ветка касательного пространства): под каплей —
// купол воды, под инеем — грани кристалликов; замёрзшие бусины остаются
// выпуклыми и под инеем
const NORMAL = /* glsl */ `
#if defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  mapN.xy = mix( mapN.xy, coldSlope, coldDrop );
  vec2 coldFacet = ( coldGrain.rg * 2.0 - 1.0 ) * 0.34;
  mapN.xy = mix( mapN.xy, coldFacet + coldSlope * coldDrop * 0.6, coldFrost );
  normal = normalize( tbn * mapN );
#else
  #include <normal_fragment_maps>
#endif
`

// Вместо clearcoat_normal_fragment_maps: лак под каплей повторяет купол воды
const CLEARCOAT_NORMAL = /* glsl */ `
#ifdef USE_CLEARCOAT_NORMALMAP
  vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
  clearcoatMapN.xy *= clearcoatNormalScale;
  clearcoatMapN.xy = mix( clearcoatMapN.xy, coldSlope, coldDrop );
  clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif
`

// После lights_physical_fragment: иней гасит лак, роса делает его мутным,
// вода — зеркальной, лёд бусин — матовым
const LIGHTS = /* glsl */ `
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - coldFrost;
  material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.45, coldMist * 0.85 );
  material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.055, coldLiquid );
  material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.14, coldDrop * coldFrozen );
#endif
`

function patchShader(shader: WebGLProgramParametersWithUniforms) {
  // Общие объекты: одно изменение значения — у всех банок сразу
  Object.assign(shader.uniforms, coldUniforms, glassUniforms)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${PARS}${GLASS_PARS}`)
    .replace('#include <map_fragment>', MAP)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${ROUGHNESS}`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${METALNESS}`)
    .replace('#include <normal_fragment_maps>', NORMAL)
    .replace('#include <clearcoat_normal_fragment_maps>', CLEARCOAT_NORMAL)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${LIGHTS}`)
    .replace('#include <opaque_fragment>', `${GLASS_ALPHA}\n#include <opaque_fragment>`)
}

// Подключает состояние поверхности к материалу этикетки. Ключ программы
// один на все этикетки — three.js соберёт шейдер один раз и отдаст его всем
// (прозрачной «стеклянной» версии — свою программу: у неё другой режим смешивания)
export function applyColdSurface(material: MeshPhysicalMaterial) {
  material.onBeforeCompile = patchShader
  material.customProgramCacheKey = () => 'can-label-cold-surface'
}
