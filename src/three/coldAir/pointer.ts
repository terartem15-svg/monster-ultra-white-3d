import { Plane, Ray, Vector2, Vector3, type Camera, type Matrix4, type Object3D, type Raycaster } from 'three'
import { motion } from '@/state/motion'

// Где курсор в пространстве группы: луч из камеры через указатель,
// пересечённый с плоскостью z = 0 группы (там стоит банка). Морозный пар и
// ледяная пыль расступаются вокруг этой точки. Сглаживание — у вызывающего:
// так частицы не дёргаются за мышью, а плавно уходят от неё.
//
// Временные объекты — на уровне модуля: в кадре ничего не создаётся

const scratch = {
  ndc: new Vector2(),
  ray: new Ray(),
  plane: new Plane(new Vector3(0, 0, 1), 0),
}

// true — точка найдена и записана в out
export function pointerOnGroupPlane(raycaster: Raycaster, camera: Camera, group: Object3D, inverse: Matrix4, out: Vector3): boolean {
  if (!motion.pointerActive || motion.reducedMotion) return false
  raycaster.setFromCamera(scratch.ndc.set(motion.pointer.x, motion.pointer.y), camera)
  scratch.ray.copy(raycaster.ray).applyMatrix4(inverse.copy(group.matrixWorld).invert())
  return scratch.ray.intersectPlane(scratch.plane, out) !== null
}
