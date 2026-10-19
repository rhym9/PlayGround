import * as THREE from 'three'

const canvas = document.getElementById('game')
const hud = document.getElementById('hud')
const scoreEl = document.getElementById('score')
const bestEl = document.getElementById('best')
const startBestEl = document.getElementById('start-best')
const finalBestEl = document.getElementById('final-best')
const finalScoreEl = document.getElementById('final-score')
const newBestEl = document.getElementById('new-best')
const heartsEl = document.getElementById('hearts')
const startScreen = document.getElementById('start-screen')
const gameOverScreen = document.getElementById('game-over')
const playButton = document.getElementById('play-button')
const restartButton = document.getElementById('restart-button')
const flashEl = document.getElementById('flash')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.18

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05010f)
scene.fog = new THREE.Fog(0x080119, 40, 170)

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 420)
const cameraBase = { y: 6.2, z: 14.2, lookZ: -4 }

const LANE_X = 2.35
const START_Z = 6.4
const SPAWN_Z = -118
const PLAYER_GROUND = 1.35
const GRAVITY = 27
const JUMP_VELOCITY = 9.4

const state = {
  mode: 'menu',
  score: 0,
  best: readBest(),
  lane: 0,
  x: 0,
  y: PLAYER_GROUND,
  vy: 0,
  speed: 22,
  lives: 3,
  invulnerable: 0,
  distance: 0,
  shards: 0,
  elapsed: 0,
  spawnTimer: 0,
  crystalTimer: 0,
  displaySpeed: 0,
  newBest: false
}

const clock = new THREE.Clock()
const rng = mulberry32(0x51f15e)
const worldMovers = []
const obstacles = []
const crystals = []
const bursts = []
const tempVec = new THREE.Vector3()

const glowTexture = makeRadialTexture()
const roadGlowTexture = makeRoadGlowTexture()
const roadTexture = makeRoadTexture()
const windowTextures = [makeWindowTexture(1), makeWindowTexture(2), makeWindowTexture(3)]

function readBest() {
  try {
    return Number(localStorage.getItem('neon-run-best')) || 0
  } catch {
    return 0
  }
}

function saveBest(value) {
  try {
    localStorage.setItem('neon-run-best', String(value))
  } catch { /* storage may be disabled */ }
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRadialTexture() {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.72)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.16)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeRoadGlowTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 8
  const ctx = c.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 64, 0)
  gradient.addColorStop(0, 'rgba(255,255,255,0)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 8)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeRoadTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#070314'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(70, 48, 160, 0.5)'
  ctx.lineWidth = 2
  ctx.strokeRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(53, 244, 255, 0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(128, 0)
  ctx.lineTo(128, 256)
  ctx.moveTo(0, 128)
  ctx.lineTo(256, 128)
  ctx.stroke()
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 34)
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return texture
}

function makeWindowTexture(variant) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = variant === 2 ? '#05010e' : '#060211'
  ctx.fillRect(0, 0, 128, 256)
  const palette = variant === 2
    ? ['#35f4ff', '#8b5cff', '#ffd166']
    : variant === 3
      ? ['#ff2d95', '#ffd166', '#35f4ff']
      : ['#35f4ff', '#ff2d95', '#8b5cff']
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 7; col++) {
      if (rng() > 0.55) {
        ctx.globalAlpha = 0.18 + rng() * 0.7
        ctx.fillStyle = palette[Math.floor(rng() * palette.length)]
        ctx.fillRect(8 + col * 17, 8 + row * 8, 7, 3)
      }
    }
  }
  ctx.globalAlpha = 1
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeGlowSprite(color, scale, opacity = 1) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(scale, scale, 1)
  return sprite
}

function addWorldMover(object, options = {}) {
  worldMovers.push({ object, speedFactor: options.speedFactor ?? 1, wrapMin: options.wrapMin ?? -270, wrapMax: options.wrapMax ?? 34 })
  return object
}

/* ------------------------------- lighting ------------------------------- */

scene.add(new THREE.HemisphereLight(0x9a7dff, 0x070012, 2.1))

const keyLight = new THREE.DirectionalLight(0xff2d95, 2.8)
keyLight.position.set(-14, 22, 6)
scene.add(keyLight)

const rimLight = new THREE.DirectionalLight(0x35f4ff, 2.4)
rimLight.position.set(16, 15, -34)
scene.add(rimLight)

/* --------------------------------- sky ---------------------------------- */

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(260, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x020009) },
      midColor: { value: new THREE.Color(0x17032f) },
      horizonColor: { value: new THREE.Color(0x4a0a4d) }
    },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      void main() {
        float h = normalize(vPosition).y;
        vec3 color = mix(horizonColor, midColor, smoothstep(-0.05, 0.24, h));
        color = mix(color, topColor, smoothstep(0.2, 0.72, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `
  })
)
sky.renderOrder = -20
scene.add(sky)

const sunGlow = makeGlowSprite(0xff3d9d, 92, 0.5)
sunGlow.position.set(0, 25, -188)
scene.add(sunGlow)

const sunCore = makeGlowSprite(0xffb6e2, 34, 0.85)
sunCore.position.set(0, 25, -187)
scene.add(sunCore)

const horizonGlow = makeGlowSprite(0x7a3cff, 230, 0.28)
horizonGlow.position.set(0, 6, -196)
horizonGlow.scale.set(280, 42, 1)
scene.add(horizonGlow)

/* -------------------------------- stars --------------------------------- */

function makeStars(count, size, color, opacity, depth) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * 260
    positions[i * 3 + 1] = 12 + rng() * 84
    positions[i * 3 + 2] = depth + rng() * 20
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    fog: false
  })
  return new THREE.Points(geometry, material)
}

const starsNear = makeStars(420, 0.9, 0xbdefff, 0.9, -210)
const starsFar = makeStars(520, 1.5, 0xffc2e8, 0.55, -240)
scene.add(starsNear, starsFar)

/* -------------------------------- ground -------------------------------- */

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(9.8, 330),
  new THREE.MeshStandardMaterial({
    map: roadTexture,
    color: 0xb9b4ff,
    roughness: 0.68,
    metalness: 0.42,
    emissive: 0x0a0320,
    emissiveIntensity: 0.9
  })
)
road.rotation.x = -Math.PI / 2
road.position.set(0, 0, -145)
scene.add(road)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(420, 420),
  new THREE.MeshStandardMaterial({ color: 0x05010e, roughness: 0.92, metalness: 0.15 })
)
ground.rotation.x = -Math.PI / 2
ground.position.set(0, -0.06, -110)
scene.add(ground)

const additiveGlow = (color, opacity) => new THREE.MeshBasicMaterial({
  map: roadGlowTexture,
  color,
  transparent: true,
  opacity,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false
})

for (const [side, color] of [[-1, 0x35f4ff], [1, 0xff2d95]]) {
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 336), additiveGlow(color, 0.65))
  strip.rotation.x = -Math.PI / 2
  strip.position.set(side * 5.05, 0.015, -145)
  scene.add(strip)

  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 336),
    new THREE.MeshBasicMaterial({ color, fog: false })
  )
  rail.position.set(side * 4.86, 0.06, -145)
  scene.add(rail)
}

const dummy = new THREE.Object3D()

const dashGeometry = new THREE.BoxGeometry(0.06, 0.03, 1.7)
const dashMaterial = new THREE.MeshBasicMaterial({ color: 0x3a3f8c })
const dashData = []
for (const lane of [-1.17, 1.17]) {
  for (let z = 8; z > -258; z -= 7) dashData.push({ x: lane, z })
}
const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashData.length)
dashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
dashes.frustumCulled = false
scene.add(dashes)

function updateDashes(speed, dt) {
  for (let i = 0; i < dashData.length; i++) {
    const dash = dashData[i]
    dash.z += speed * dt
    if (dash.z > 10) dash.z -= 266
    dummy.position.set(dash.x, 0.025, dash.z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    dashes.setMatrixAt(i, dummy.matrix)
  }
  dashes.instanceMatrix.needsUpdate = true
}

/* -------------------------------- city ---------------------------------- */

const buildingMaterial = new THREE.MeshStandardMaterial({
  map: windowTextures[0],
  emissiveMap: windowTextures[0],
  emissive: 0xffffff,
  emissiveIntensity: 0.55,
  color: 0x0b061c,
  roughness: 0.85,
  metalness: 0.25
})

const antennaMaterial = new THREE.MeshBasicMaterial({ color: 0xff4fa8, fog: false })
const antennaGeometry = new THREE.BoxGeometry(0.09, 1.2, 0.09)

const BUILDING_COUNT = 64
const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), buildingMaterial, BUILDING_COUNT)
buildings.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
buildings.frustumCulled = false
scene.add(buildings)

const antennas = new THREE.InstancedMesh(antennaGeometry, antennaMaterial, BUILDING_COUNT)
antennas.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
antennas.frustumCulled = false
scene.add(antennas)

const buildingData = []
const tint = new THREE.Color()
for (let i = 0; i < BUILDING_COUNT; i++) {
  const side = i % 2 === 0 ? -1 : 1
  const width = 2.4 + rng() * 5.4
  const depth = 2.2 + rng() * 4.8
  const height = 4 + rng() * 22
  buildingData.push({
    side,
    width,
    depth,
    height,
    x: side * (11 + rng() * 32),
    z: -255 + rng() * 288,
    antenna: rng() > 0.62
  })
  tint.setHSL(0.72 + rng() * 0.16, 0.35 + rng() * 0.3, 0.5 + rng() * 0.2)
  buildings.setColorAt(i, tint)
}
buildings.instanceColor.needsUpdate = true

function updateBuildings(speed, dt) {
  for (let i = 0; i < buildingData.length; i++) {
    const building = buildingData[i]
    building.z += speed * dt * 0.96
    if (building.z > 34) {
      building.z -= 292
      building.x = building.side * (11 + rng() * 32)
    }

    dummy.position.set(building.x, building.height / 2 - 0.1, building.z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(building.width, building.height, building.depth)
    dummy.updateMatrix()
    buildings.setMatrixAt(i, dummy.matrix)

    if (building.antenna) {
      dummy.position.set(building.x - building.side * building.width * 0.2, building.height + 0.55, building.z)
      dummy.scale.set(1, 1, 1)
    } else {
      dummy.position.set(0, -50, 0)
      dummy.scale.set(0.001, 0.001, 0.001)
    }
    dummy.updateMatrix()
    antennas.setMatrixAt(i, dummy.matrix)
  }
  buildings.instanceMatrix.needsUpdate = true
  antennas.instanceMatrix.needsUpdate = true
}

/* ------------------------------- pylons --------------------------------- */

const pylonMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
const pylonGeometry = new THREE.BoxGeometry(0.1, 2.6, 0.1)
const PYLON_COUNT = 36
const pylons = new THREE.InstancedMesh(pylonGeometry, pylonMaterial, PYLON_COUNT)
pylons.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
pylons.frustumCulled = false
scene.add(pylons)

const pylonData = []
for (let i = 0; i < PYLON_COUNT; i++) {
  const side = i % 2 === 0 ? -1 : 1
  pylonData.push({ side, x: side * 6.3, z: 10 - Math.floor(i / 2) * 15 })
  tint.set(side === -1 ? 0x35f4ff : 0xff2d95)
  pylons.setColorAt(i, tint)
}
pylons.instanceColor.needsUpdate = true

const pylonGlowPositions = new Float32Array(PYLON_COUNT * 3)
const pylonGlowColors = new Float32Array(PYLON_COUNT * 3)
const pylonGlowGeometry = new THREE.BufferGeometry()
pylonGlowGeometry.setAttribute('position', new THREE.BufferAttribute(pylonGlowPositions, 3))
pylonGlowGeometry.setAttribute('color', new THREE.BufferAttribute(pylonGlowColors, 3))
const pylonGlowPoints = new THREE.Points(pylonGlowGeometry, new THREE.PointsMaterial({
  map: glowTexture,
  size: 2.9,
  transparent: true,
  opacity: 0.5,
  vertexColors: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
  fog: false
}))
pylonGlowPoints.frustumCulled = false
scene.add(pylonGlowPoints)

for (let i = 0; i < PYLON_COUNT; i++) {
  const color = new THREE.Color(pylonData[i].side === -1 ? 0x35f4ff : 0xff2d95)
  pylonGlowColors[i * 3] = color.r
  pylonGlowColors[i * 3 + 1] = color.g
  pylonGlowColors[i * 3 + 2] = color.b
}

function updatePylons(speed, dt) {
  for (let i = 0; i < pylonData.length; i++) {
    const pylon = pylonData[i]
    pylon.z += speed * dt
    if (pylon.z > 12) pylon.z -= 270
    dummy.position.set(pylon.x, 1.3, pylon.z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    pylons.setMatrixAt(i, dummy.matrix)

    pylonGlowPositions[i * 3] = pylon.x
    pylonGlowPositions[i * 3 + 1] = 1.5
    pylonGlowPositions[i * 3 + 2] = pylon.z
  }
  pylons.instanceMatrix.needsUpdate = true
  pylonGlowGeometry.attributes.position.needsUpdate = true
}

/* ------------------------------- arches --------------------------------- */

const archMaterial = new THREE.MeshBasicMaterial({ color: 0x8b5cff, fog: false })
const archTrimMaterial = new THREE.MeshBasicMaterial({ color: 0x35f4ff, fog: false })
const archBarGeometry = new THREE.BoxGeometry(13.2, 0.12, 0.12)
const archPostGeometry = new THREE.BoxGeometry(0.12, 5.6, 0.12)

for (let i = 0; i < 6; i++) {
  const group = new THREE.Group()
  const bar = new THREE.Mesh(archBarGeometry, archMaterial)
  bar.position.y = 5.6
  group.add(bar)

  const trim = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.04, 0.22), archTrimMaterial)
  trim.position.y = 5.54
  trim.position.z = 0.06
  group.add(trim)

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(archPostGeometry, archMaterial)
    post.position.set(side * 6.55, 2.8, 0)
    group.add(post)
  }

  const halo = makeGlowSprite(0x9a6bff, 5.2, 0.2)
  halo.position.set(0, 5.7, 0)
  group.add(halo)

  group.position.z = 4 - i * 44
  scene.add(group)
  addWorldMover(group)
}

/* -------------------------------- player -------------------------------- */

const ship = new THREE.Group()
ship.position.set(0, PLAYER_GROUND, START_Z)
scene.add(ship)

const hullMaterial = new THREE.MeshStandardMaterial({
  color: 0x16224a,
  metalness: 0.92,
  roughness: 0.22,
  emissive: 0x0a3350,
  emissiveIntensity: 1.1
})

const hullGeometry = new THREE.ConeGeometry(0.58, 1.95, 4)
hullGeometry.rotateY(Math.PI / 4)
hullGeometry.rotateX(-Math.PI / 2)
const hull = new THREE.Mesh(hullGeometry, hullMaterial)
hull.position.z = -0.08
ship.add(hull)

const canopy = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 18, 12),
  new THREE.MeshStandardMaterial({
    color: 0x0a2c3a,
    metalness: 0.6,
    roughness: 0.12,
    emissive: 0x35f4ff,
    emissiveIntensity: 1.4
  })
)
canopy.scale.set(0.85, 0.55, 1.45)
canopy.position.set(0, 0.18, -0.12)
ship.add(canopy)

const wingMaterial = new THREE.MeshStandardMaterial({
  color: 0x1b1147,
  metalness: 0.8,
  roughness: 0.3,
  emissive: 0x5620a8,
  emissiveIntensity: 0.9,
  side: THREE.DoubleSide
})

function makeWing(sign) {
  const geometry = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    0.22 * sign, 0, -0.42,
    1.38 * sign, 0, 0.6,
    0.26 * sign, 0, 0.72
  ])
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  const wing = new THREE.Mesh(geometry, wingMaterial)
  wing.position.y = -0.06
  ship.add(wing)

  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0.22 * sign, 0.012, -0.42,
    1.38 * sign, 0.012, 0.6
  ]), 3))
  const edge = new THREE.Line(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x35f4ff, transparent: true, opacity: 0.9 }))
  ship.add(edge)
}

makeWing(-1)
makeWing(1)

const engineCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xbdfcff })
)
engineCore.position.z = 0.92
ship.add(engineCore)

const engineRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.32, 0.05, 10, 28),
  new THREE.MeshBasicMaterial({ color: 0x35f4ff })
)
engineRing.position.z = 0.9
ship.add(engineRing)

const engineGlow = makeGlowSprite(0x35f4ff, 2.9, 0.85)
engineGlow.position.set(0, 0, 1.1)
ship.add(engineGlow)

const engineGlowPink = makeGlowSprite(0xff2d95, 2.2, 0.4)
engineGlowPink.position.set(0, 0, 1.08)
ship.add(engineGlowPink)

const underGlow = makeGlowSprite(0x7a5cff, 3.2, 0.45)
underGlow.position.set(0, -0.42, 0.1)
ship.add(underGlow)

const shipLight = new THREE.PointLight(0x35f4ff, 26, 18, 2)
shipLight.position.set(0, 0.3, 1)
ship.add(shipLight)

const floorGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 5.2),
  new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0x6d4dff,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
)
floorGlow.rotation.x = -Math.PI / 2
floorGlow.position.set(0, 0.02, 0.2)
ship.add(floorGlow)

/* ------------------------------- obstacles ------------------------------ */

const barrierBodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b0017,
  emissive: 0xff2d95,
  emissiveIntensity: 1.5,
  metalness: 0.45,
  roughness: 0.35
})
const barrierBarMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0f7 })
const barrierGeometry = new THREE.BoxGeometry(1.95, 0.78, 0.46)
const barrierBarGeometry = new THREE.BoxGeometry(2.08, 0.06, 0.56)

const pillarMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a0426,
  emissive: 0x8b5cff,
  emissiveIntensity: 0.72,
  metalness: 0.7,
  roughness: 0.32
})
const pillarGeometry = new THREE.BoxGeometry(1.28, 2.55, 0.56)
const pillarTubeGeometry = new THREE.BoxGeometry(0.07, 2.55, 0.07)
const pillarTubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff2d95 })

function createObstacle() {
  const group = new THREE.Group()
  group.visible = false

  const low = new THREE.Group()
  const body = new THREE.Mesh(barrierGeometry, barrierBodyMaterial)
  body.position.y = 0.39
  low.add(body)
  const topBar = new THREE.Mesh(barrierBarGeometry, barrierBarMaterial)
  topBar.position.y = 0.79
  low.add(topBar)
  const lowGlow = makeGlowSprite(0xff2d95, 2.6, 0.55)
  lowGlow.position.set(0, 0.45, 0.2)
  low.add(lowGlow)

  const tall = new THREE.Group()
  const column = new THREE.Mesh(pillarGeometry, pillarMaterial)
  column.position.y = 1.28
  tall.add(column)
  for (const side of [-1, 1]) {
    const tube = new THREE.Mesh(pillarTubeGeometry, pillarTubeMaterial)
    tube.position.set(side * 0.58, 1.28, 0.31)
    tall.add(tube)
  }
  const tallGlow = makeGlowSprite(0x8b5cff, 3.4, 0.45)
  tallGlow.position.set(0, 1.3, 0.28)
  tall.add(tallGlow)

  group.add(low, tall)
  scene.add(group)

  const record = { group, low, tall, active: false, type: 'low', height: 0.8, z: 0 }
  obstacles.push(record)
  return record
}

for (let i = 0; i < 14; i++) createObstacle()

/* ------------------------------- crystals ------------------------------- */

const crystalMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd166,
  emissive: 0xff9f1c,
  emissiveIntensity: 1.7,
  metalness: 0.65,
  roughness: 0.18
})
const crystalGeometry = new THREE.OctahedronGeometry(0.3, 0)

function createCrystal() {
  const group = new THREE.Group()
  const core = new THREE.Mesh(crystalGeometry, crystalMaterial)
  group.add(core)

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.018, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.6 })
  )
  ring.rotation.x = Math.PI / 2
  group.add(ring)

  const glow = makeGlowSprite(0xffb347, 1.9, 0.65)
  group.add(glow)

  group.visible = false
  scene.add(group)
  const record = { group, core, ring, active: false, z: 0, y: 1.45, baseY: 1.45, phase: 0 }
  crystals.push(record)
  return record
}

for (let i = 0; i < 28; i++) createCrystal()

/* ------------------------------- particles ------------------------------ */

for (let i = 0; i < 28; i++) {
  const sprite = makeGlowSprite(0xffd166, 0.9, 0)
  sprite.visible = false
  scene.add(sprite)
  bursts.push({ sprite, vx: 0, vy: 0, vz: 0, life: 0 })
}

function emitBurst(x, y, z, color) {
  let emitted = 0
  for (const particle of bursts) {
    if (particle.life > 0) continue
    particle.life = 0.55 + rng() * 0.2
    particle.vx = (rng() - 0.5) * 7
    particle.vy = (rng() - 0.2) * 6
    particle.vz = (rng() - 0.5) * 5
    particle.sprite.position.set(x, y, z)
    particle.sprite.material.color.setHex(color)
    particle.sprite.material.opacity = 0.9
    particle.sprite.visible = true
    emitted++
    if (emitted >= 6) break
  }
}

/* -------------------------------- audio --------------------------------- */

let audioContext = null
let muted = false

function ensureAudio() {
  if (muted) return
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)()
    if (audioContext.state === 'suspended') audioContext.resume()
  } catch {
    audioContext = null
  }
}

function tone(from, to, duration, type = 'sine', volume = 0.045) {
  if (!audioContext || muted) return
  try {
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  } catch { /* ignore audio failures */ }
}

/* ------------------------------- gameplay ------------------------------- */

function randomLanePolicy() {
  const freeLane = Math.floor(rng() * 3) - 1
  const blocked = []
  for (const lane of [-1, 0, 1]) {
    if (lane === freeLane) continue
    if (blocked.length === 0 ? rng() > 0.22 : rng() > 0.55) blocked.push(lane)
  }
  if (blocked.length === 0) blocked.push(freeLane === -1 ? 0 : -1)
  return { freeLane, blocked }
}

function spawnObstacleRow(z = SPAWN_Z) {
  const { freeLane, blocked } = randomLanePolicy()
  for (const lane of blocked) {
    const record = obstacles.find((item) => !item.active)
    if (!record) continue
    record.active = true
    record.type = rng() > 0.58 ? 'tall' : 'low'
    record.height = record.type === 'tall' ? 2.55 : 0.8
    record.z = z + (rng() - 0.5) * 0.5
    record.low.visible = record.type === 'low'
    record.tall.visible = record.type === 'tall'
    record.group.visible = true
    record.group.position.set(lane * LANE_X, 0, record.z)
  }
  spawnCrystalLine(z - 14 - rng() * 10, freeLane)
}

function spawnCrystalLine(z, lane) {
  const count = 3 + Math.floor(rng() * 3)
  const high = rng() > 0.65
  for (let i = 0; i < count; i++) {
    const record = crystals.find((item) => !item.active)
    if (!record) return
    record.active = true
    record.z = z - i * 4.2
    record.baseY = high ? 2.35 + Math.sin(i * 0.7) * 0.3 : 1.45
    record.y = record.baseY
    record.phase = rng() * Math.PI * 2
    record.group.position.set(lane * LANE_X, record.y, record.z)
    record.group.visible = true
  }
}

function clearField() {
  for (const obstacle of obstacles) {
    obstacle.active = false
    obstacle.group.visible = false
  }
  for (const crystal of crystals) {
    crystal.active = false
    crystal.group.visible = false
  }
  for (const particle of bursts) {
    particle.life = 0
    particle.sprite.visible = false
  }
}

function startGame() {
  ensureAudio()
  clearField()
  state.mode = 'running'
  state.score = 0
  state.lives = 3
  state.lane = 0
  state.x = 0
  state.y = PLAYER_GROUND
  state.vy = 0
  state.speed = 22
  state.distance = 0
  state.shards = 0
  state.elapsed = 0
  state.invulnerable = 0
  state.spawnTimer = 0.6
  state.crystalTimer = 0
  state.displaySpeed = 22
  state.newBest = false
  ship.visible = true
  ship.position.set(0, PLAYER_GROUND, START_Z)
  ship.rotation.set(0, 0, 0)

  startScreen.classList.add('hidden')
  gameOverScreen.classList.add('hidden')
  hud.hidden = false
  newBestEl.classList.remove('show')
  updateHearts()
  updateHud(true)

  spawnObstacleRow(-46)
  spawnObstacleRow(-78)
  spawnObstacleRow(-108)
  spawnCrystalLine(-26, 1)
  spawnCrystalLine(-64, 0)
  tone(240, 760, 0.28, 'triangle', 0.05)
  setTimeout(() => tone(620, 1240, 0.22, 'sine', 0.035), 110)
}

function endGame() {
  state.mode = 'over'
  const finalScore = Math.floor(state.score)
  state.newBest = finalScore > state.best
  if (state.newBest) {
    state.best = finalScore
    saveBest(state.best)
  }
  finalScoreEl.textContent = finalScore.toLocaleString('en-US')
  finalBestEl.textContent = state.best.toLocaleString('en-US')
  bestEl.textContent = state.best.toLocaleString('en-US')
  startBestEl.textContent = state.best.toLocaleString('en-US')
  newBestEl.classList.toggle('show', state.newBest)
  gameOverScreen.classList.remove('hidden')
  tone(420, 60, 0.55, 'sawtooth', 0.05)
}

function moveLane(direction) {
  if (state.mode !== 'running') return
  const next = Math.max(-1, Math.min(1, state.lane + direction))
  if (next === state.lane) return
  state.lane = next
  tone(520 + direction * 90, 760 + direction * 90, 0.087, 'triangle', 0.022)
}

function jump() {
  if (state.mode !== 'running') return
  if (state.y > PLAYER_GROUND + 0.05) return
  state.vy = JUMP_VELOCITY
  tone(330, 660, 0.16, 'triangle', 0.03)
}

function hitObstacle() {
  if (state.invulnerable > 0) return
  state.lives -= 1
  state.invulnerable = 1.35
  updateHearts()
  flashEl.classList.add('on')
  setTimeout(() => flashEl.classList.remove('on'), 90)
  tone(180, 52, 0.32, 'sawtooth', 0.055)
  emitBurst(state.x, state.y, START_Z, 0xff2d95)
  if (state.lives <= 0) endGame()
}

function collect(record) {
  record.active = false
  record.group.visible = false
  state.shards += 1
  state.score += 15
  emitBurst(record.group.position.x, record.group.position.y, record.group.position.z, 0xffd166)
  tone(1046, 1568, 0.11, 'sine', 0.032)
}

function updateHearts() {
  const hearts = heartsEl.querySelectorAll('.heart')
  hearts.forEach((heart, index) => {
    heart.classList.toggle('dead', index >= state.lives)
  })
}

let lastScore = -1
function updateHud(force = false) {
  const value = Math.floor(state.score)
  if (force || value !== lastScore) {
    lastScore = value
    scoreEl.textContent = value.toLocaleString('en-US')
  }
}

function addScore(amount) {
  state.score += amount
}

/* -------------------------------- input --------------------------------- */

const swipe = { x: 0, y: 0, time: 0, active: false }

canvas.addEventListener('pointerdown', (event) => {
  swipe.x = event.clientX
  swipe.y = event.clientY
  swipe.time = performance.now()
  swipe.active = true
  canvas.setPointerCapture?.(event.pointerId)
}, { passive: true })

canvas.addEventListener('pointerup', (event) => {
  if (!swipe.active) return
  swipe.active = false
  const dx = event.clientX - swipe.x
  const dy = event.clientY - swipe.y
  const elapsed = performance.now() - swipe.time
  if (state.mode === 'menu') return
  if (Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy) * 1.15) {
    moveLane(dx > 0 ? 1 : -1)
  } else if (dy < -34 && Math.abs(dy) > Math.abs(dx)) {
    jump()
  } else if (elapsed < 320 && Math.abs(dx) < 22 && Math.abs(dy) < 22) {
    jump()
  }
}, { passive: true })

canvas.addEventListener('pointercancel', () => { swipe.active = false }, { passive: true })

window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
    event.preventDefault()
    moveLane(-1)
  } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
    event.preventDefault()
    moveLane(1)
  } else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
    event.preventDefault()
    if (state.mode === 'running') jump()
    else if (state.mode === 'menu') startGame()
    else startGame()
  } else if (event.key === 'Enter') {
    if (state.mode === 'menu' || state.mode === 'over') startGame()
  } else if (event.key === 'm' || event.key === 'M') {
    muted = !muted
  }
})

playButton.addEventListener('click', () => startGame())
restartButton.addEventListener('click', () => startGame())

/* -------------------------------- world --------------------------------- */

function stepWorld(dt, speed) {
  for (const item of worldMovers) {
    item.object.position.z += speed * dt * item.speedFactor
    if (item.object.position.z > item.wrapMax) {
      item.object.position.z = item.wrapMin + rng() * 18
    }
  }

  updateDashes(speed, dt)
  updateBuildings(speed, dt)
  updatePylons(speed, dt)

  for (const obstacle of obstacles) {
    if (!obstacle.active) continue
    obstacle.z += speed * dt
    obstacle.group.position.z = obstacle.z
    if (obstacle.z > 16) {
      obstacle.active = false
      obstacle.group.visible = false
    }
  }

  for (const crystal of crystals) {
    if (!crystal.active) continue
    crystal.z += speed * dt
    crystal.phase += dt * 3.2
    crystal.group.position.z = crystal.z
    crystal.group.position.y = crystal.y + Math.sin(crystal.phase) * 0.1
    crystal.core.rotation.y += dt * 2.4
    crystal.core.rotation.x += dt * 1.2
    crystal.ring.rotation.z += dt * 1.8
    if (crystal.z > 16) {
      crystal.active = false
      crystal.group.visible = false
    }
  }

  roadTexture.offset.y -= speed * dt * 0.033

  for (const particle of bursts) {
    if (particle.life <= 0) continue
    particle.life -= dt
    particle.sprite.position.x += particle.vx * dt
    particle.sprite.position.y += particle.vy * dt
    particle.sprite.position.z += particle.vz * dt
    particle.vy -= 9 * dt
    particle.sprite.material.opacity = Math.max(0, particle.life * 1.6)
    if (particle.life <= 0) particle.sprite.visible = false
  }
}

function checkCollisions() {
  for (const obstacle of obstacles) {
    if (!obstacle.active) continue
    if (Math.abs(obstacle.z - START_Z) > 0.86) continue
    if (Math.abs(obstacle.group.position.x - state.x) > 1.02) continue
    if (obstacle.type === 'low' && state.y > 1.95) continue
    hitObstacle()
    obstacle.active = false
    obstacle.group.visible = false
    return
  }

  if (state.invulnerable > 0) return
  for (const crystal of crystals) {
    if (!crystal.active) continue
    if (Math.abs(crystal.z - START_Z) > 0.9) continue
    if (Math.abs(crystal.group.position.x - state.x) > 0.9) continue
    if (Math.abs(crystal.group.position.y - state.y) > 0.95) continue
    collect(crystal)
  }
}

function updatePlayer(dt, t) {
  const targetX = state.lane * LANE_X
  state.x += (targetX - state.x) * Math.min(1, dt * 11)
  state.y += state.vy * dt
  if (state.y > PLAYER_GROUND) {
    state.vy -= GRAVITY * dt
  } else {
    state.y = PLAYER_GROUND
    state.vy = 0
  }
  state.invulnerable = Math.max(0, state.invulnerable - dt)

  const roll = (targetX - state.x) * 0.38
  const bob = Math.sin(t * 3.1) * 0.07
  ship.position.x = state.x
  ship.position.y = state.y + bob
  ship.position.z = START_Z
  ship.rotation.z = roll
  ship.rotation.y = (targetX - state.x) * -0.09
  ship.rotation.x = Math.max(-0.18, Math.min(0.18, state.vy * -0.012))

  if (state.invulnerable > 0 && state.mode === 'running') {
    ship.visible = Math.floor(state.invulnerable * 16) % 2 === 0
  } else {
    ship.visible = true
  }

  engineGlow.scale.setScalar(2.6 + Math.sin(t * 22) * 0.22)
  underGlow.material.opacity = 0.36 + Math.sin(t * 9) * 0.08
  engineRing.rotation.z += dt * 4
}

function updateMenu(dt, t) {
  ship.position.x += (0 - ship.position.x) * Math.min(1, dt * 6)
  ship.position.y = PLAYER_GROUND + Math.sin(t * 2.1) * 0.12
  ship.position.z = START_Z
  ship.rotation.z = Math.sin(t * 0.9) * 0.05
  ship.rotation.y = Math.sin(t * 0.55) * 0.14
  ship.rotation.x = 0
  engineGlow.scale.setScalar(2.5 + Math.sin(t * 18) * 0.2)
  engineRing.rotation.z += dt * 2.2
  stepWorld(dt, 7)
}

/* -------------------------------- camera -------------------------------- */

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height, false)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  camera.aspect = width / height
  const aspect = width / height
  if (aspect < 0.72) {
    camera.fov = 79
    cameraBase.y = 7.1
    cameraBase.z = 15.2
    cameraBase.lookZ = -11
  } else if (aspect < 1.05) {
    camera.fov = 68
    cameraBase.y = 6.6
    cameraBase.z = 14.6
    cameraBase.lookZ = -6
  } else {
    camera.fov = 60
    cameraBase.y = 6.2
    cameraBase.z = 14.2
    cameraBase.lookZ = -4
  }
  camera.updateProjectionMatrix()
}

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => setTimeout(resize, 120))
resize()
camera.position.set(0, cameraBase.y, cameraBase.z)
camera.lookAt(0, 1.4, cameraBase.lookZ)

function updateCamera(dt, t) {
  const lookX = state.mode === 'running' ? state.x : 0
  camera.position.x += (lookX * 0.24 - camera.position.x) * Math.min(1, dt * 4.5)
  const jumpLift = state.mode === 'running' ? (state.y - PLAYER_GROUND) * 0.07 : 0
  camera.position.y = cameraBase.y + Math.sin(t * 0.7) * 0.04 + jumpLift
  camera.position.z = cameraBase.z
  camera.lookAt(lookX * 0.34, 1.4, cameraBase.lookZ)
}

/* --------------------------------- loop --------------------------------- */

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05)
  state.elapsed += dt
  const t = state.elapsed

  if (state.mode === 'running') {
    state.speed = Math.min(47, state.speed + dt * 0.62)
    state.displaySpeed = state.speed
    state.distance += state.speed * dt
    addScore(state.speed * dt * 1.35)
    state.spawnTimer += dt
    const spawnInterval = Math.max(0.46, 0.92 - state.speed * 0.009)
    if (state.spawnTimer >= spawnInterval) {
      state.spawnTimer = 0
      spawnObstacleRow()
    }
    updatePlayer(dt, t)
    stepWorld(dt, state.speed)
    checkCollisions()
    updateHud()

    starsNear.rotation.y += dt * 0.0015
    starsFar.rotation.y -= dt * 0.001
  } else if (state.mode === 'menu') {
    updateMenu(dt, t)
  } else {
    state.displaySpeed = Math.max(0, state.displaySpeed - dt * 26)
    stepWorld(dt, state.displaySpeed)
    ship.position.y += (PLAYER_GROUND - ship.position.y) * Math.min(1, dt * 3)
    ship.rotation.z += dt * 0.35
    ship.rotation.x = Math.sin(t * 1.5) * 0.25
    engineGlow.scale.setScalar(Math.max(0.1, state.displaySpeed / 20))
    updateHud()
  }

  updateCamera(dt, t)
  sky.position.set(camera.position.x, 0, camera.position.z)
  renderer.render(scene, camera)
  window.__GAME_FRAMES__ = (window.__GAME_FRAMES__ || 0) + 1
  requestAnimationFrame(frame)
}

/* --------------------------------- init --------------------------------- */

startBestEl.textContent = state.best.toLocaleString('en-US')
bestEl.textContent = state.best.toLocaleString('en-US')
updateHearts()

window.__GAME_STATE__ = state
window.__NEON_RUN__ = {
  start: startGame,
  state,
  get ready() { return true },
  rendererInfo() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      width: renderer.domElement.width,
      height: renderer.domElement.height
    }
  }
}
window.__GAME_FRAMES__ = 0
window.__GAME_READY__ = false

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__GAME_READY__ = true
  })
})

frame()
