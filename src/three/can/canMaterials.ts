import { MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type CanvasTexture, type Texture } from 'three'
import { createSpunMetalNormalTexture } from './lidParts'

// Материалы банки — общие для банки первого экрана (SlicedCan) и банок
// коллекции (lineup/LineupCans). Одинаковые параметры — это ещё и один и тот
// же скомпилированный шейдер: three.js кэширует программы по набору
// настроек, и банка нового вкуса появляется без паузы на компиляцию.
//
//  - label: корпус. Металличность и шероховатость — из карты surface
//    (серебро орнамента и фольга — металл, белая краска — нет, капли —
//    гладкая вода), рельеф — из карты нормалей: тиснение когтя и надписей,
//    капли конденсата, иней, зерно краски. Сверху прозрачный лак (clearcoat)
//    с тем же рельефом — капли и тиснение ловят блики лака.
//  - lid: крышка и дно — голый алюминий с концентрической "токарной"
//    фактурой; анизотропия вытягивает блики по кругу, как у настоящей крышки.
//  - tab: язычок — чуть светлее и глаже крышки.
//  - edge: срез стенки — свежий блестящий торец металла.
//  - crystal: лёд на срезах. Грани с разными оттенками (vertexColors) и
//    плоское затенение; высокий ior даёт "бриллиантовые" отражения, лёгкая
//    иридесценция — радужный отсвет, как у кристаллов льда на свету.

// Три карты этикетки одной развёртки (см. labelTexture.ts, label/imageLabel.ts)
export interface LabelMaps {
  color: Texture
  surface: Texture
  normal: Texture
}

export function createLabelMaterial(maps: LabelMaps): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: maps.color,
    roughnessMap: maps.surface,
    metalnessMap: maps.surface,
    normalMap: maps.normal,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.09,
    clearcoatNormalMap: maps.normal,
    clearcoatNormalScale: new Vector2(0.85, 0.85),
    envMapIntensity: 1.15,
  })
}

// Смена карт на готовом материале. Набор карт тот же — шейдер тот же,
// перекомпиляция не нужна: three.js сам подхватит новые текстуры в кадре
export function setLabelMaps(material: MeshPhysicalMaterial, maps: LabelMaps) {
  material.map = maps.color
  material.roughnessMap = maps.surface
  material.metalnessMap = maps.surface
  material.normalMap = maps.normal
  material.clearcoatNormalMap = maps.normal
}

export interface MetalMaterials {
  lid: MeshPhysicalMaterial
  tab: MeshPhysicalMaterial
  edge: MeshStandardMaterial
  crystal: MeshPhysicalMaterial
  spun: CanvasTexture
}

export function createMetalMaterials(): MetalMaterials {
  const spun = createSpunMetalNormalTexture()
  return {
    lid: new MeshPhysicalMaterial({
      color: '#d5dbe0',
      metalness: 1,
      roughness: 0.24,
      normalMap: spun,
      normalScale: new Vector2(0.35, 0.35),
      anisotropy: 0.55,
      envMapIntensity: 1.2,
    }),
    tab: new MeshPhysicalMaterial({
      color: '#e2e7eb',
      metalness: 1,
      roughness: 0.15,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.25,
    }),
    edge: new MeshStandardMaterial({ color: '#f1f5f8', metalness: 1, roughness: 0.14 }),
    crystal: new MeshPhysicalMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.07,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      ior: 1.9,
      iridescence: 0.32,
      iridescenceIOR: 1.35,
      envMapIntensity: 1.55,
    }),
    spun,
  }
}

export function disposeMetalMaterials(materials: MetalMaterials) {
  materials.lid.dispose()
  materials.tab.dispose()
  materials.edge.dispose()
  materials.crystal.dispose()
  materials.spun.dispose()
}
