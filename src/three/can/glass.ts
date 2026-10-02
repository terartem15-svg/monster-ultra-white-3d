import { MathUtils, type MeshPhysicalMaterial } from 'three'

// «Стеклянная» банка главы «Состав»: стенка становится полупрозрачной, и
// сквозь неё видны капсулы внутри. Это не отдельный материал, а вторая
// версия материала этикетки — с настоящей прозрачностью (transparent): у неё
// тот же шейдер со всеми картами, каплями и инеем (cold/coldSurface.ts), но
// другой режим смешивания, поэтому three.js собирает для неё отдельную
// программу. Собирается она заранее, при загрузке (меши со стеклянным
// материалом лежат в сцене скрытыми), — посреди скролла компиляции нет.
//
// Почему не прозрачность на обычном материале: прозрачные объекты не попадают
// в буфер преломления, и лёд с каплями первого экрана перестали бы
// преломлять банку. Поэтому стеклянные меши подменяют обычные только на
// время главы (can/SlicedCan.tsx), когда льда и капель рядом с банкой нет.
//
// Что остаётся видно на стекле (GLSL ниже):
//  - края силуэта — стекло «толще» там, где поверхность уходит от зрителя;
//  - тёмная печать — обводка когтя и надписи, как рисунок на бутылке;
//    белая краска исчезает почти целиком;
//  - капли конденсата и иней на горлышке и каблуке — они лежат на стекле;
//  - блики: там, где лак отражает свет, стекло непрозрачнее.

// Общий uniform всех материалов этикетки (у непрозрачных он не используется)
export const glassUniforms = {
  uCanGlass: { value: 0 },
}

export function setCanGlass(amount: number) {
  glassUniforms.uCanGlass.value = amount
}

// Прозрачность «тела» стекла — там, где нет ни печати, ни капель, ни бликов
const BODY = 0.07

const f = (value: number) => value.toFixed(3)

export const GLASS_PARS = /* glsl */ `
uniform float uCanGlass;
`

// Сразу после чтения цвета этикетки: насколько в этой точке тёмная печать
// (до того, как цвет изменят капли и иней)
export const GLASS_INK = /* glsl */ `
float glassInk = 1.0 - smoothstep( 0.06, 0.4, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
`

// Перед opaque_fragment: итоговая прозрачность. Переменные cold* — из патча
// поверхности (coldSurface.ts), totalSpecular и clearcoatSpecular* — из
// стандартного шейдера three.js
export const GLASS_ALPHA = /* glsl */ `
#ifndef OPAQUE
  float glassFacing = saturate( dot( nonPerturbedNormal, geometryViewDir ) );
  float glassEdge = pow( 1.0 - glassFacing, 2.6 );
  vec3 glassShine = totalSpecular;
  #ifdef USE_CLEARCOAT
    glassShine += ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
  #endif
  float glassGloss = max( glassShine.r, max( glassShine.g, glassShine.b ) );
  float glassBody = ${f(BODY)}
    + glassEdge * 0.62
    + glassInk * 0.9
    + coldDrop * 0.5
    + coldTrail * 0.1
    + coldFrost * 0.85
    + smoothstep( 0.05, 0.9, glassGloss ) * 0.75;
  diffuseColor.a *= mix( 1.0, clamp( glassBody, 0.0, 1.0 ), uCanGlass );
#endif
`

// Крышка, язычок и дно стеклянной банки — их прозрачные версии: числа
// материала те же, меняется только прозрачность. Обновление — функцией
// уровня модуля: материалы созданы в useMemo (правило oxlint immutability)
const LID_GLASS_OPACITY = 0.14

export function applyLidGlass(materials: readonly MeshPhysicalMaterial[], amount: number) {
  const opacity = MathUtils.lerp(1, LID_GLASS_OPACITY, amount)
  for (const material of materials) material.opacity = opacity
}
