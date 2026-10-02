import { Body, Box, ContactMaterial, Cylinder, Material, Quaternion, Sphere, Vec3, World } from 'cannon-es'
import { Euler, Quaternion as ThreeQuaternion, Vector3 as ThreeVector3 } from 'three'

// Физика кубиков льда на cannon-es. Гравитации нет — лёд "плавает" в
// воздухе, как поплавок в воде: каждый кубик привязан мягкой пружиной к
// своей точке-якорю, а якорь медленно ходит вверх-вниз. Из-за инерции
// кубик отстаёт от якоря и чуть перелетает его — движение получается живым,
// а не синусоидой из учебника. Курсор толкает лёд (сила + закрутка), куски
// банки и банки коллекции — кинематические цилиндры, о которые лёд честно
// ударяется (улетающая банка коллекции расталкивает кубики на пути).
//
// Все координаты — в локальном пространстве группы льда (внутри CanRig),
// то есть в тех же единицах, что и банка.

export interface IceCubeSpec {
  // Кубик — коробка; крошка (осколок) — для физики просто шарик
  shape: 'cube' | 'chip'
  size: number
  // Точка покоя в разобранном состоянии
  anchor: [number, number, number]
  // Откуда кубик влетает при загрузке — за краем кадра
  enterFrom: [number, number, number]
  // Ориентация покоя (углы Эйлера, рад)
  rest: [number, number, number]
  // Покачивание вверх-вниз: амплитуда, период (с), фаза
  bob: [number, number, number]
  seed: number
}

export interface IcePieceSpec {
  radius: number
  height: number
}

export interface PointerInput {
  // Позиция и скорость указателя в локальных координатах; null — указателя нет
  position: ThreeVector3 | null
  velocity: ThreeVector3
}

export interface FlowInput {
  // 0..1 — насколько лёд разлетается к краям на скролле
  spread: number
  // 0..1 — сцена деталей: лёд уходит за края кадра, освобождая место
  // подписям-выноскам вокруг увеличенной банки
  detail: number
  // Множитель амплитуды покачивания (reduced motion, скролл)
  calm: number
  // 0..1 — глава «Состав»: лёд уходит далеко за края кадра и не возвращается,
  // пока глава на экране, — место вокруг банки занимают капсулы и метки
  away: number
}

// --- Параметры поведения ---------------------------------------------------------

// Пружина к якорю: жёсткость и демпфирование подобраны под коэффициент
// затухания ~0.7 — кубик после толчка возвращается мягко, с еле заметным
// перелётом, без "резинового" дребезга
const SPRING_STIFFNESS = 5
const SPRING_DAMPING = 3.1
// Возврат к ориентации покоя и "раскачка" — медленное покачивание на волне
const ORIENT_STIFFNESS = 0.9
const ORIENT_DAMPING = 0.9
const ROCK_TORQUE = 0.16

// Толчок курсором: радиус влияния (ед.), сила от скорости курсора и от
// близости, потолок силы — чтобы резкий взмах мышью не выбивал лёд из кадра
const POINTER_RADIUS = 1.05
const POINTER_PUSH = 2.2
const POINTER_REPEL = 2.6
const POINTER_MAX_FORCE = 14
const MAX_SPEED = 5
// Насколько якоря расходятся, когда лёд уходит за кадр (множители к
// координатам якоря): с запасом на широкие экраны
const AWAY_X = 4.5
const AWAY_Y = 1.3

// Фиксированный шаг симуляции; рендер берёт интерполированные позиции.
// Подшагов на кадр хватает, чтобы физика шла в реальном времени даже при
// 4 FPS: на слабом устройстве лёд не уходит в "замедленную съёмку".
const STEP = 1 / 120
const MAX_SUBSTEPS = 30

interface IceCube {
  spec: IceCubeSpec
  body: Body
  restQuaternion: Quaternion
}

const scratch = {
  force: new Vec3(),
  point: new Vec3(),
  torque: new Vec3(),
  error: new Quaternion(),
  inverse: new Quaternion(),
}

export class IceWorld {
  readonly world: World
  readonly cubes: IceCube[]
  readonly pieces: Body[]
  private released = false
  private pointer: PointerInput = { position: null, velocity: new ThreeVector3() }
  private flow: FlowInput = { spread: 0, detail: 0, calm: 1, away: 0 }

  constructor(cubeSpecs: IceCubeSpec[], pieceSpecs: IcePieceSpec[], startAtRest: boolean) {
    this.world = new World({ gravity: new Vec3(0, 0, 0) })
    this.world.allowSleep = false

    // Лёд скользкий и почти не пружинит: при ударе о банку кубик мягко
    // отталкивается и закручивается, а не отскакивает мячиком
    const iceMaterial = new Material('ice')
    const canMaterial = new Material('can')
    this.world.addContactMaterial(new ContactMaterial(iceMaterial, iceMaterial, { friction: 0.04, restitution: 0.25 }))
    this.world.addContactMaterial(new ContactMaterial(iceMaterial, canMaterial, { friction: 0.02, restitution: 0.3 }))

    this.cubes = cubeSpecs.map((spec) => {
      const half = spec.size * 0.46
      const start = startAtRest ? spec.anchor : spec.enterFrom
      const body = new Body({
        mass: 1,
        shape: spec.shape === 'chip' ? new Sphere(spec.size * 0.45) : new Box(new Vec3(half, half, half)),
        position: new Vec3(...start),
        material: iceMaterial,
        linearDamping: 0.08,
        angularDamping: 0.12,
      })
      const rest = new ThreeQuaternion().setFromEuler(new Euler(...spec.rest))
      const restQuaternion = new Quaternion(rest.x, rest.y, rest.z, rest.w)
      body.quaternion.copy(restQuaternion)
      if (!startAtRest) {
        // Влетают с закруткой — к якорю приходят уже успокоившись
        body.angularVelocity.set((spec.seed % 3) - 1, 1.6, 0.8)
      }
      this.world.addBody(body)
      return { spec, body, restQuaternion }
    })

    this.pieces = pieceSpecs.map(({ radius, height }) => {
      const body = new Body({
        mass: 0,
        type: Body.KINEMATIC,
        shape: new Cylinder(radius, radius, height, 20),
        material: canMaterial,
      })
      this.world.addBody(body)
      return body
    })

    this.released = startAtRest
    this.world.addEventListener('preStep', this.applyForces)
  }

  // Отпустить лёд к якорям (старт вступительной анимации)
  release() {
    this.released = true
  }

  // Кинематическое тело куска банки следует за видимым куском
  setPiece(index: number, position: ThreeVector3, quaternion: ThreeQuaternion) {
    const body = this.pieces[index]
    if (!body) return
    body.position.set(position.x, position.y, position.z)
    body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
  }

  // Банка за кадром или ещё не на сцене — её тело лёд не расталкивает
  setPieceActive(index: number, active: boolean) {
    const body = this.pieces[index]
    if (body) body.collisionResponse = active
  }

  step(delta: number, pointer: PointerInput, flow: FlowInput) {
    this.pointer = pointer
    this.flow = flow
    // Кадр мог "подвиснуть" (вкладка в фоне) — догоняем не больше 0.25 с,
    // иначе после возврата на вкладку лёд "телепортировался" бы
    this.world.step(STEP, Math.min(delta, 0.25), MAX_SUBSTEPS)
  }

  // Силы считаются перед каждым подшагом интеграции (событие preStep):
  // cannon сбрасывает накопленные силы после каждого подшага
  private applyForces = () => {
    const time = this.world.time
    const { spread, detail, calm, away } = this.flow
    const { force, point, torque, error, inverse } = scratch

    for (const { spec, body, restQuaternion } of this.cubes) {
      // --- Якорь: поплавок, медленно идущий вверх-вниз -----------------------------
      const [ax, ay, az] = this.released ? spec.anchor : spec.enterFrom
      const [bobAmplitude, bobPeriod, bobPhase] = spec.bob
      const bob = this.released ? Math.sin((time / bobPeriod) * Math.PI * 2 + bobPhase) * bobAmplitude * calm : 0
      // На скролле якоря расходятся к краям и чуть назад — лёд уступает
      // место собранной банке, а в сцене деталей и в «Составе» уходит за
      // края кадра
      const targetX = ax * (1 + spread * 0.85 + detail * 1.1 + away * AWAY_X)
      const targetY = ay * (1 + spread * 0.3 + detail * 0.4 + away * AWAY_Y) + bob
      const targetZ = az - spread * 0.6

      force.set(
        (targetX - body.position.x) * SPRING_STIFFNESS - body.velocity.x * SPRING_DAMPING,
        (targetY - body.position.y) * SPRING_STIFFNESS - body.velocity.y * SPRING_DAMPING,
        (targetZ - body.position.z) * SPRING_STIFFNESS - body.velocity.z * SPRING_DAMPING,
      )
      body.applyForce(force)

      // --- Ориентация: мягкий возврат к позе покоя + покачивание ----------------------
      // Ошибка ориентации q_rest * q^-1 → ось-угол → корректирующий момент
      body.quaternion.conjugate(inverse)
      restQuaternion.mult(inverse, error)
      if (error.w < 0) {
        error.x = -error.x
        error.y = -error.y
        error.z = -error.z
        error.w = -error.w
      }
      const rock = Math.sin((time / (bobPeriod * 1.35)) * Math.PI * 2 + bobPhase) * ROCK_TORQUE * calm
      torque.set(
        error.x * 2 * ORIENT_STIFFNESS - body.angularVelocity.x * ORIENT_DAMPING + rock,
        error.y * 2 * ORIENT_STIFFNESS - body.angularVelocity.y * ORIENT_DAMPING,
        error.z * 2 * ORIENT_STIFFNESS - body.angularVelocity.z * ORIENT_DAMPING - rock * 0.6,
      )
      body.torque.vadd(torque, body.torque)

      // --- Курсор ------------------------------------------------------------------------
      const pointerPosition = this.pointer.position
      if (pointerPosition && this.released) {
        const dx = body.position.x - pointerPosition.x
        const dy = body.position.y - pointerPosition.y
        const distance = Math.hypot(dx, dy)
        const reach = POINTER_RADIUS + spec.size * 0.5
        if (distance < reach) {
          const falloff = (1 - distance / reach) ** 2
          const nx = distance > 1e-4 ? dx / distance : 0
          const ny = distance > 1e-4 ? dy / distance : 1
          const { velocity } = this.pointer
          const speed = Math.hypot(velocity.x, velocity.y)
          // Толчок по направлению движения курсора + отталкивание от него,
          // пропорциональное скорости: неподвижный курсор лёд не трогает
          force.set(
            (velocity.x * POINTER_PUSH + nx * POINTER_REPEL * Math.min(speed, 3)) * falloff,
            (velocity.y * POINTER_PUSH + ny * POINTER_REPEL * Math.min(speed, 3)) * falloff,
            -Math.min(speed, 3) * 0.6 * falloff,
          )
          const magnitude = force.length()
          if (magnitude > POINTER_MAX_FORCE) force.scale(POINTER_MAX_FORCE / magnitude, force)
          // Сила приложена к стороне кубика, обращённой к курсору, — отсюда
          // закрутка, как от касания пальцем
          point.set(-nx * spec.size * 0.4, -ny * spec.size * 0.4, 0)
          body.applyForce(force, point)
        }
      }

      // Ограничитель скорости на случай очень резких взмахов
      const speed = body.velocity.length()
      if (speed > MAX_SPEED) body.velocity.scale(MAX_SPEED / speed, body.velocity)
    }
  }

  dispose() {
    this.world.removeEventListener('preStep', this.applyForces)
    for (const body of [...this.world.bodies]) this.world.removeBody(body)
  }
}
