import { useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AgXToneMapping,
  Color,
  DirectionalLight,
  HalfFloatType,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderChunk,
  Vector3,
} from 'three'
import { CSM } from 'three/addons/csm/CSM.js'
import {
  SelectiveBloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { useShelterStore } from '../../store/useShelterStore'
import { shadowUniforms } from './shadowUniforms'
import { sunAt } from './PhysicalSky'

const tiers = [
  { dpr: 0.75, cascades: 1, shadow: 512, ao: false, half: true, trees: 125 },
  { dpr: 1, cascades: 2, shadow: 768, ao: true, half: true, trees: 220 },
  { dpr: 1.25, cascades: 3, shadow: 1024, ao: true, half: true, trees: 340 },
  { dpr: 1.5, cascades: 3, shadow: 1536, ao: true, half: false, trees: 420 },
]
const Quality = createContext(tiers[2])
export const useQuality = () => useContext(Quality)
export function QualityControl({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState(2),
    setDpr = useThree((s) => s.setDpr)
  const sample = useRef({ frames: 0, elapsed: 0 })
  useFrame((_, dt) => {
    if (dt > 0 && dt < 0.4) {
      sample.current.frames++
      sample.current.elapsed += dt
    }
  })
  useEffect(() => {
    const fixed = new URLSearchParams(location.search).get('quality')
    if (fixed && /^[0-3]$/.test(fixed)) {
      setTier(Number(fixed))
      return
    }
    let fast = 0
    const timer = setInterval(() => {
      const { frames, elapsed } = sample.current
      sample.current = { frames: 0, elapsed: 0 }
      if (document.hidden || !frames || elapsed < 1) return
      const ms = (1000 * elapsed) / frames
      if (ms > 17.8) {
        fast = 0
        setTier((t) => Math.max(0, t - 1))
      } else if (ms < 16.95 && ++fast >= 10) {
        fast = 0
        setTier((t) => Math.min(3, t + 1))
      } else if (ms >= 16.95) fast = 0
    }, 2000)
    return () => clearInterval(timer)
  }, [])
  useLayoutEffect(() => {
    setDpr(Math.min(devicePixelRatio, tiers[tier].dpr))
  }, [tier, setDpr])
  return <Quality.Provider value={tiers[tier]}>{children}</Quality.Provider>
}
export function SunShadows() {
  const scene = useThree((s) => s.scene),
    gl = useThree((s) => s.gl),
    camera = useThree((s) => s.camera)
  const tier = useQuality(),
    time = useShelterStore((s) => s.time),
    cold = useShelterStore((s) => s.cold)
  const outdoors = useShelterStore((s) => s.mode === 'exterior' && s.cameraState === 'site')
  const csm = useRef<CSM | null>(null)
  const lastEye = useRef(new Vector3())
  const lastTurn = useRef(new Quaternion())
  const sinceShadow = useRef(0)
  const projection = useRef(new Matrix4())
  useLayoutEffect(() => {
    const sun = sunAt(time)
    const tint = new Color(cold ? '#eaf4ff' : sun.y < 0.18 ? '#ffcd94' : '#fff1dc')
    if (!outdoors) {
      const fill = new DirectionalLight(time === '19:30' ? '#a2bfe8' : '#e6edf2', 0.91)
      fill.position.set(-12, 19, 32)
      scene.add(fill)
      return () => {
        scene.remove(fill)
        fill.dispose()
      }
    }
    // CSM installs global shader chunks. Our PBR shaders own their shared cascade uniforms.
    const chunks = [ShaderChunk.lights_pars_begin, ShaderChunk.lights_fragment_begin]
    const shadows = new CSM({
      camera,
      parent: scene,
      cascades: tier.cascades,
      maxFar: 520,
      shadowMapSize: tier.shadow,
      mode: 'practical',
      lightDirection: sun.clone().negate(),
      lightIntensity: cold ? 1.1 : 2.75,
      shadowBias: -0.00014,
      lightMargin: 90,
    })
    for (const light of shadows.lights) {
      light.color.copy(tint)
      light.shadow.normalBias = 0.035
    }
    type CascadeMaterial = MeshStandardMaterial & { defines: Record<string, number> }
    const bound = new Set<CascadeMaterial>()
    function bind() {
      scene.traverse((o) => {
        if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return
        const m = o.material as CascadeMaterial
        if (bound.has(m)) return
        bound.add(m)
        m.defines.USE_CSM = 1
        m.defines.CSM_CASCADES = shadows.cascades
        m.needsUpdate = true
      })
    }
    bind()
    csm.current = shadows
    gl.shadowMap.needsUpdate = true
    projection.current.identity()
    return () => {
      shadows.remove()
      shadows.dispose()
      shadows.lights.forEach((l) => l.dispose())
      csm.current = null
      for (const m of bound) {
        delete m.defines.USE_CSM
        delete m.defines.CSM_CASCADES
        m.needsUpdate = true
      }
      ;[ShaderChunk.lights_pars_begin, ShaderChunk.lights_fragment_begin] = chunks
    }
  }, [scene, gl, camera, tier, time, cold, outdoors])
  useFrame((_, dt) => {
    if (!csm.current) return
    sinceShadow.current += dt
    camera.updateMatrixWorld()
    if (!projection.current.equals(camera.projectionMatrix)) {
      projection.current.copy(camera.projectionMatrix)
      const shadow = csm.current
      shadow.updateFrustums()
      camera.projectionMatrix.copy(projection.current)
      camera.projectionMatrixInverse.copy(projection.current).invert()
      shadow.breaks.forEach((end, i) =>
        shadowUniforms.CSM_cascades.value[i].set(shadow.breaks[i - 1] ?? 0, end),
      )
      shadowUniforms.cameraNear.value = camera.near
      shadowUniforms.shadowFar.value = Math.min(camera.far, shadow.maxFar)
      projection.current.copy(camera.projectionMatrix)
      gl.shadowMap.needsUpdate = true
    }
    // Static casters can reuse their light-space maps between small orbit steps.
    // A cut, new sun or projection still refreshes all cascades immediately.
    const moved =
      camera.position.distanceToSquared(lastEye.current) > 4 ||
      camera.quaternion.angleTo(lastTurn.current) > 0.035
    if ((moved && sinceShadow.current >= 0.16) || gl.shadowMap.needsUpdate) {
      csm.current.update()
      lastEye.current.copy(camera.position)
      lastTurn.current.copy(camera.quaternion)
      sinceShadow.current = 0
      gl.shadowMap.needsUpdate = true
    }
  }, -0.2)
  return null
}

export function RenderPipeline() {
  const scene = useThree((s) => s.scene),
    gl = useThree((s) => s.gl),
    camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size),
    dpr = useThree((s) => s.viewport.dpr),
    tier = useQuality()
  const composer = useRef<EffectComposer | null>(null),
    canvas = gl.domElement
  const bloomRef = useRef<SelectiveBloomEffect | null>(null)
  const revision = useShelterStore((s) => s.cameraRevision),
    floor = useShelterStore((s) => s.floor)
  const walk = useShelterStore((s) => s.cameraState === 'walkthrough'),
    xray = useShelterStore((s) => s.mode === 'xray')
  useLayoutEffect(() => {
    const pipe = new EffectComposer(gl, {
      frameBufferType: HalfFloatType,
      depthBuffer: true,
      stencilBuffer: true,
    })
    const render = new RenderPass(scene, camera)
    render.clearPass.setClearFlags(true, true, true)
    pipe.addPass(render)
    let ao: N8AOPostPass | undefined
    if (tier.ao && !xray) {
      ao = new N8AOPostPass(scene, camera, Math.max(2, canvas.width), Math.max(2, canvas.height))
      ao.autoDetectTransparency = false
      ao.configuration.gammaCorrection = false
      ao.configuration.halfRes = tier.half
      ao.setQualityMode(tier.half ? 'Low' : 'Medium')
      ao.configuration.aoRadius = walk ? 0.55 : 1.8
      ao.configuration.intensity = 1.6
      pipe.addPass(ao)
    }
    const bloom = new SelectiveBloomEffect(scene, camera, {
      luminanceThreshold: 0.66,
      luminanceSmoothing: 0.12,
      intensity: 0.31,
      mipmapBlur: true,
      levels: 4,
    })
    bloom.ignoreBackground = true
    bloomRef.current = bloom
    pipe.addPass(new EffectPass(camera, bloom))
    pipe.addPass(
      new EffectPass(
        camera,
        new SMAAEffect({ preset: SMAAPreset.LOW }),
        new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
      ),
    )
    composer.current = pipe
    gl.toneMapping = AgXToneMapping
    gl.info.autoReset = false
    gl.shadowMap.needsUpdate = true
    return () => {
      composer.current = null
      bloom.selection.clear()
      bloomRef.current = null
      // n8ao 1.10's inherited Pass.dispose handles render targets, but not its fullscreen triangle wrappers.
      if (ao)
        for (const quad of [
          ao.copyQuad,
          ao.accumulationQuad,
          ao.effectShaderQuad,
          ao.poissonBlurQuad,
          ao.effectCompositerQuad,
          ao.depthDownsampleQuad,
        ])
          quad?.dispose()
      pipe.dispose()
      gl.info.autoReset = true
    }
  }, [camera, gl, scene, tier, walk, xray, canvas])
  useLayoutEffect(() => {
    const bloom = bloomRef.current
    if (!bloom) return
    bloom.selection.clear()
    scene.traverse((o) => {
      if (o.userData.finish === 'lamp' || o.userData.emits) bloom.selection.add(o)
    })
  }, [scene, revision, floor, camera, tier, walk, xray])
  useLayoutEffect(() => {
    composer.current?.setSize(size.width, size.height)
  }, [size, dpr])
  let frames = 0
  useFrame((_, dt) => {
    gl.info.reset()
    composer.current?.render(Math.min(dt, 0.1))
    canvas.dataset.calls = String(gl.info.render.calls)
    canvas.dataset.triangles = String(gl.info.render.triangles)
    if (++frames === 2) canvas.dataset.rendered = 'true'
  }, 1)
  return null
}
