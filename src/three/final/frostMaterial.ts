import {
  Color,
  FrontSide,
  MeshPhysicalMaterial,
  Vector2,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { coldUniforms } from '../can/cold/coldSurface'

// Материал морозного стекла финального экрана. Это MeshPhysicalMaterial с
// пропусканием (transmission): three.js сам рендерит сцену за стеклом в
// буфер с мип-уровнями, а шероховатость выбирает, насколько размытый уровень
// взять, — отсюда честное «матовое стекло», за которым банка — мягкий
// силуэт. Остальное дописывает патч шейдера (onBeforeCompile), как у этикетки
// банки (can/cold/coldSurface.ts):
//  - иней растёт от краёв экрана к центру по uFrostGrow; фронт рвёт узор
//    (frostPattern.ts), папоротники обгоняют его;
//  - где маска протёрта (state/frost.ts) — чистое стекло: фрагмент
//    отбрасывается, и видна сама сцена, а не её копия из буфера;
//  - после удара по краям осколков бегут трещины, а вершинный шейдер роняет
//    каждый осколок: вращение, разлёт от удара, гравитация.
//
// Прозрачный (transparent) материал с пропусканием рисуется в проходе
// преломляющих объектов, после льда и капель, и смешивается с кадром: у края
// протёртого иней тает плавно. Глубину пишет — плёнка инея на кубиках льда
// (прозрачная, рисуется позже) не проступает сквозь иней на стекле.
// Тонмаппинг выключен: буфер за стеклом уже в линейных цветах сцены, а фон
// сцены (Backdrop.tsx) рисуется без тонмаппинга — так иней не серее фона.

export const frostUniforms = {
  uFrostPattern: { value: null as Texture | null },
  uFrostMask: { value: null as Texture | null },
  // Зерно кристаллов — то же, что у инея на банке
  uFrostGrain: coldUniforms.uColdGrain,
  // Повтор плитки узора и зерна по экрану
  uFrostTile: { value: new Vector2(1, 1) },
  uFrostGrainRepeat: { value: new Vector2(1, 1) },
  // Размер листа в мировых единицах и пропорция экрана
  uFrostSize: { value: new Vector2(1, 1) },
  uFrostAspect: { value: 1 },
  // Иней по скроллу 0..1 и таяние 0..1
  uFrostGrow: { value: 0 },
  uFrostMelt: { value: 0 },
  // Точка удара (доли экрана, v вверх), радиус фронта трещин (в высотах
  // экрана; < 0 — трещин нет), время падения осколков, с (< 0 — не падают),
  // дальность самого дальнего угла и задержка самого дальнего осколка
  uFrostOrigin: { value: new Vector2(0.5, 0.5) },
  uFrostCrack: { value: -1 },
  uFrostFall: { value: -1 },
  uFrostReach: { value: 1 },
  uFrostStagger: { value: 0.5 },
  // 1 — стекло разбито: и протёртые места летят прозрачными осколками
  uFrostBroken: { value: 0 },
  // Шероховатость для размытия за самым толстым инеем (FrostGlass.tsx
  // подбирает её под плотность пикселей: размытие в CSS px одинаковое)
  uFrostBlur: { value: 0.5 },
  // Цвет кристаллов
  uFrostWhite: { value: new Color('#eaf4fb') },
}

// --- Вершинный шейдер ---------------------------------------------------------------------

const VERTEX_PARS = /* glsl */ `
attribute float aEdge;
attribute float aOpen;
attribute vec4 aShard;
uniform vec2 uFrostSize;
uniform float uFrostAspect;
uniform vec2 uFrostOrigin;
uniform float uFrostFall;
uniform float uFrostReach;
uniform float uFrostStagger;
varying vec2 vFrostUv;
varying float vFrostEdge;
varying float vFrostOpen;
varying float vFrostFade;

// Поворот вокруг оси (формула Родрига), столбцы матрицы
mat3 frostRotation( vec3 axis, float angle ) {
  float s = sin( angle );
  float c = cos( angle );
  float t = 1.0 - c;
  return mat3(
    t * axis.x * axis.x + c, t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
    t * axis.x * axis.y - s * axis.z, t * axis.y * axis.y + c, t * axis.y * axis.z + s * axis.x,
    t * axis.x * axis.z + s * axis.y, t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c
  );
}
`

// Вместо beginnormal_vertex: время падения этого осколка и его поворот.
// Ближние к удару падают первыми; ось вращения и скорость — свои у куска.
//
// Материал односторонний (двусторонний собрал бы для прохода преломления ещё
// одну программу — посреди скролла), а кувыркающийся осколок то и дело
// поворачивается к камере тыльной стороной и отсекался бы — мигал бы в
// полёте. Поэтому повёрнутый тыльной стороной осколок зеркалится в своей
// плоскости: так плоское стекло и выглядит с обратной стороны, обход
// треугольников снова лицевой, а нормаль смотрит на камеру. Подмена — в
// момент, когда осколок стоит ребром, и её не видно
const VERTEX_NORMAL = /* glsl */ `
vFrostUv = position.xy;
vFrostEdge = aEdge;
vFrostOpen = aOpen;
vec2 frostAway = vec2( ( aShard.x - uFrostOrigin.x ) * uFrostAspect, aShard.y - uFrostOrigin.y );
float frostDistance = length( frostAway );
float frostT = max( 0.0, uFrostFall - frostDistance / max( uFrostReach, 0.001 ) * uFrostStagger - aShard.z * 0.06 );
vec3 frostAxis = normalize( vec3( aShard.z - 0.5, aShard.w - 0.5, 0.35 * ( aShard.z - aShard.w ) ) + vec3( 0.0, 0.001, 0.0 ) );
float frostAngle = frostT * mix( 1.4, 4.6, aShard.w ) * ( aShard.z < 0.5 ? - 1.0 : 1.0 );
mat3 frostSpin = frostRotation( frostAxis, frostAngle );
vec3 frostFacing = frostSpin * vec3( 0.0, 0.0, 1.0 );
float frostFlip = frostFacing.z < 0.0 ? - 1.0 : 1.0;
vec3 objectNormal = frostFacing * frostFlip;
`

// Вместо begin_vertex: доли экрана → мировые единицы листа; осколок
// поворачивается вокруг своего центра, разлетается от удара, летит чуть к
// камере и падает с ускорением (единицы — высоты экрана в секунду)
const VERTEX_BEGIN = /* glsl */ `
vec3 frostCenter = vec3( ( aShard.xy - 0.5 ) * uFrostSize, 0.0 );
vec3 frostLocal = vec3( ( position.xy - aShard.xy ) * uFrostSize * vec2( frostFlip, 1.0 ), 0.0 );
vec2 frostDir = frostDistance > 0.0001 ? frostAway / frostDistance : vec2( 0.0, 1.0 );
float frostH = uFrostSize.y;
vec3 frostMove = vec3( frostDir * frostH * mix( 0.1, 0.38, aShard.z ) * frostT, mix( 0.6, 2.2, aShard.w ) * frostT );
frostMove.y += frostH * ( 0.22 * frostT - 1.5 * frostT * frostT );
vec3 transformed = frostCenter + frostSpin * frostLocal * ( 1.0 - 0.1 * min( frostT, 1.0 ) ) + frostMove;
vFrostFade = 1.0 - smoothstep( 0.9, 1.5, frostT );
`

// --- Фрагментный шейдер ---------------------------------------------------------------------

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uFrostPattern;
uniform sampler2D uFrostMask;
uniform sampler2D uFrostGrain;
uniform vec2 uFrostTile;
uniform vec2 uFrostGrainRepeat;
uniform float uFrostAspect;
uniform float uFrostGrow;
uniform float uFrostMelt;
uniform vec2 uFrostOrigin;
uniform float uFrostCrack;
uniform float uFrostBroken;
uniform float uFrostBlur;
uniform vec3 uFrostWhite;
varying vec2 vFrostUv;
varying float vFrostEdge;
varying float vFrostOpen;
varying float vFrostFade;

// Крупный плавный шум — рвёт фронт инея на больших масштабах
float frostHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float frostNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( frostHash( i ), frostHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( frostHash( i + vec2( 0.0, 1.0 ) ), frostHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`

// Вместо map_fragment: сколько здесь инея и видна ли трещина. Все
// переменные с префиксом frost — чтобы не столкнуться с переменными three
const FRAGMENT_FROST = /* glsl */ `
vec2 frostUv = vFrostUv;
vec2 frostPattern = texture2D( uFrostPattern, frostUv * uFrostTile ).rg;
vec4 frostGrain = texture2D( uFrostGrain, frostUv * uFrostGrainRepeat );

// --- Рост: фронт ползёт от краёв экрана к центру, рваный по узору; стебли
// папоротников приходят раньше. Расстояние до края — в высотах экрана, и
// это мягкий минимум: в углах иней приходит раньше, и фронт скругляется, а
// не сходится прямым углом; крупный шум ещё и рвёт его на волны
vec2 frostS = vec2( frostUv.x * uFrostAspect, frostUv.y );
vec2 frostSides = max( vec2( min( frostS.x, uFrostAspect - frostS.x ), min( frostS.y, 1.0 - frostS.y ) ), 0.0 );
float frostEdgeDistance = - 0.09 * log( exp( - frostSides.x / 0.09 ) + exp( - frostSides.y / 0.09 ) );
float frostWave = frostNoise( frostS * 2.3 ) * 0.65 + frostNoise( frostS * 5.1 + 7.3 ) * 0.35;
frostEdgeDistance = max( 0.0, frostEdgeDistance + ( frostWave - 0.5 ) * 0.22 );
float frostArrival = 0.72 * smoothstep( 0.0, 0.48, frostEdgeDistance ) + ( frostPattern.r - 0.5 ) * 0.44 + 0.06;
frostArrival = max( frostArrival, 0.02 );
float frostLevel = uFrostGrow * 1.08 * ( 1.0 - uFrostMelt );
float frostFront = max( fwidth( frostArrival ) * 1.5, 0.004 );
float frostCover = smoothstep( frostArrival - frostFront, frostArrival + frostFront, frostLevel );
// Чем раньше пришёл иней, тем он гуще; у самых краёв — толще всего
float frostAge = clamp( ( frostLevel - frostArrival ) / 0.3, 0.0, 1.0 );
float frostRim = 1.0 - smoothstep( 0.0, 0.16, frostEdgeDistance );
float frostThick = frostCover * mix( 0.5, 1.0, frostAge ) * clamp( frostPattern.g + 0.3 * frostRim, 0.0, 1.0 );

// --- Протёртое: край рвётся по кристаллам — маску сдвигает шум зерна и узора.
// Ширина сглаживания не бывает нулевой: smoothstep с равными краями в GLSL
// не определён
vec2 frostMaskRG = texture2D( uFrostMask, frostUv ).rg;
float frostMaskValue = frostMaskRG.r;
float frostWipeField = frostMaskValue + ( frostGrain.a - 0.92 ) * 1.4 + ( frostPattern.g - 0.45 ) * 0.22;
float frostWipeEdge = max( fwidth( frostWipeField ), 0.012 );
float frostWiped = smoothstep( 0.5 - frostWipeEdge, 0.5 + frostWipeEdge, frostWipeField );
// Прорезь когтя: внутри неё и рядом с ней всё глубже, чем у мазка
float frostClaw = smoothstep( 0.2, 0.8, frostMaskRG.g );
float frostClawNear = smoothstep( 0.04, 0.4, frostMaskRG.g ) * ( 1.0 - frostWiped );
// Валик у края протёртого: иней, сдвинутый кистью, — плотнее и белее; у
// прорези когтя — рваный белый край сколотого инея
float frostRidge = max( smoothstep( 0.24, 0.46, frostMaskValue ) * ( 1.0 - frostWiped ), frostClawNear ) * frostCover;
float frostAmount = clamp( frostThick + frostRidge * 0.3, 0.0, 1.0 ) * ( 1.0 - frostWiped );
// Кромка с чистой стороны: полоска талой воды, темнее стекла. По ней
// читается и мазок, и прорезь когтя, даже когда за стеклом почти белый фон;
// у когтя она шире. Ширина — по плавной маске, а не по полю с шумом: у
// зерна на стыках граней скачки, и полоска легла бы сеткой по всему протёртому
float frostLipWidth = clamp( fwidth( frostMaskValue ), 0.004, 0.05 );
float frostLip = frostWiped * ( 1.0 - smoothstep( 0.5 + frostLipWidth, 0.5 + frostLipWidth * mix( 6.0, 13.0, frostClaw ), frostWipeField ) ) * frostCover;
// Сама прорезь — холодная голубая щель в инее: силуэт когтя виден на любом фоне
float frostGouge = frostClaw * frostWiped * frostCover;

// --- Трещины: по краям осколков (aEdge → 0), до которых дошёл фронт от удара.
// Тонкая щель посередине — прозрачная, по бокам — белая кромка скола
vec2 frostFromOrigin = vec2( ( frostUv.x - uFrostOrigin.x ) * uFrostAspect, frostUv.y - uFrostOrigin.y );
float frostReachHere = length( frostFromOrigin ) + ( frostPattern.r - 0.5 ) * 0.06;
float frostReached = step( 0.0, uFrostCrack ) * ( 1.0 - smoothstep( uFrostCrack - 0.03, uFrostCrack, frostReachHere ) );
float frostEdgeWidth = max( fwidth( vFrostEdge ), 0.00001 );
float frostCrack = ( 1.0 - smoothstep( frostEdgeWidth * 0.8, frostEdgeWidth * 2.4, vFrostEdge ) ) * vFrostOpen * frostReached;
float frostGap = ( 1.0 - smoothstep( 0.0, frostEdgeWidth * 0.9, vFrostEdge ) ) * vFrostOpen * frostReached;

// Непрозрачность: даже тонкий иней — уже матовое стекло. Протёртое стекло
// видно, только когда по нему прошла трещина, — дальше оно летит прозрачным
// осколком (блики, преломление)
float frostAlpha = smoothstep( 0.0, 0.05, frostAmount );
frostAlpha = max( frostAlpha, uFrostBroken * frostReached * 0.2 );
frostAlpha = max( frostAlpha, frostLip * 0.9 );
frostAlpha = max( frostAlpha, frostGouge * 0.34 );
frostAlpha = max( frostAlpha, frostCrack * 0.9 ) * ( 1.0 - frostGap * 0.8 );
diffuseColor.a = frostAlpha * vFrostFade;
if ( diffuseColor.a < 0.004 ) discard;
`

// После roughnessmap_fragment: шероховатость для бликов — грани кристаллов
// то матовые, то зеркальные (иней искрится), чистое стекло гладкое
const FRAGMENT_ROUGHNESS = /* glsl */ `
roughnessFactor = mix( 0.06, mix( 0.62, 0.16, frostGrain.b ), smoothstep( 0.0, 0.3, frostAmount ) );
`

// После normal_fragment_maps: грани кристаллов наклоняют нормаль — блики
// дробятся в искры, а сцена за стеклом чуть преломляется по зерну
const FRAGMENT_NORMAL = /* glsl */ `
normal = normalize( normal + vec3( ( frostGrain.rg * 2.0 - 1.0 ) * 0.32 * smoothstep( 0.0, 0.4, frostAmount ), 0.0 ) );
`

// Перед transmission_fragment: освещение уже посчитано, дальше шероховатость
// нужна только пропусканию — это и есть размытие сцены за инеем
const FRAGMENT_BLUR = /* glsl */ `
material.roughness = uFrostBlur * smoothstep( 0.0, 0.55, frostAmount );
`

// После transmission_fragment: поверх размытой сцены — белизна кристаллов
// (стебли папоротников почти непрозрачные, дымка — тонкая), кромки трещин,
// валик у протёртого и тёмная кромка талой воды. Блики — только искры на
// гранях и сколы
const FRAGMENT_WHITE = /* glsl */ `
float frostWhite = frostAmount * mix( 0.32, 0.86, frostPattern.g ) + frostCrack * 0.6 + frostRidge * mix( 0.15, 0.5, frostClawNear );
vec3 frostTint = uFrostWhite * mix( 0.9, 1.04, frostGrain.a );
totalDiffuse = mix( totalDiffuse, frostTint, clamp( frostWhite, 0.0, 0.94 ) );
totalDiffuse *= mix( vec3( 1.0 ), vec3( 0.72, 0.85, 0.97 ), frostGouge );
totalDiffuse *= mix( vec3( 1.0 ), vec3( 0.58, 0.7, 0.82 ), frostLip * mix( 0.75, 0.95, frostClaw ) );
totalSpecular *= mix( 0.35, 1.0, frostGrain.b ) * ( 0.3 + 0.7 * frostAmount ) + frostCrack;
`

function patchShader(shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, frostUniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <beginnormal_vertex>', VERTEX_NORMAL)
    .replace('#include <begin_vertex>', VERTEX_BEGIN)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${FRAGMENT_PARS}`)
    .replace('#include <map_fragment>', FRAGMENT_FROST)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT_ROUGHNESS}`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_NORMAL}`)
    .replace('#include <transmission_fragment>', `${FRAGMENT_BLUR}\n#include <transmission_fragment>\n${FRAGMENT_WHITE}`)
}

// Стекло: ior как у стекла (при нём шероховатость размывает в полную силу),
// тонкая толща — преломление по зерну лёгкое, без «лупы»
export function createFrostMaterial(pattern: Texture, mask: Texture): MeshPhysicalMaterial {
  frostUniforms.uFrostPattern.value = pattern
  frostUniforms.uFrostMask.value = mask
  const material = new MeshPhysicalMaterial({
    color: '#ffffff',
    transmission: 1,
    thickness: 0.05,
    roughness: 0.5,
    ior: 1.5,
    specularIntensity: 1,
    transparent: true,
    depthWrite: true,
    side: FrontSide,
    toneMapped: false,
  })
  material.onBeforeCompile = patchShader
  material.customProgramCacheKey = () => 'frost-glass'
  return material
}
