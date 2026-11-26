import type { SurveyRuntime } from '../camera/runtime'
import { precompileSurvey } from './warmPrograms'
import { useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  AgXToneMapping,
  DirectionalLight,
  HalfFloatType,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ShaderChunk,
  Vector3,
  type Camera,
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
  { dpr: 0.75, shadow: 512, ao: false, trees: 125 },
  { dpr: 1, shadow: 768, ao: true, trees: 220 },
  { dpr: 1.25, shadow: 1024, ao: true, trees: 340 },
  { dpr: 1.5, shadow: 1536, ao: true, trees: 420 },
]
const Quality = createContext(tiers[2])
export const useQuality = () => useContext(Quality)
export function QualityControl({ children }: { children: ReactNode }) {
  const fixed = useMemo(() => {
    const param = new URLSearchParams(location.search).get('quality')
    return param !== null && /^[0-3]$/.test(param) ? Number(param) : null
  }, [])
  const tier = tiers[fixed ?? 2]
  const setDpr = useThree((s) => s.setDpr)
  const meter = useRef({
    dpr: Math.min(devicePixelRatio, tier.dpr),
    pose: new Matrix4(),
    frames: [] as number[],
    lastTaskEnd: 0,
    fast: 0,
    slow: 0,
  })
  useLayoutEffect(() => {
    setDpr(meter.current.dpr)
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return
    const observer = new PerformanceObserver((list) => {
      for (const task of list.getEntries()) meter.current.lastTaskEnd = task.startTime + task.duration
    })
    observer.observe({ type: 'longtask' })
    return () => observer.disconnect()
  }, [setDpr])
  useFrame(({ camera, gl }, dt) => {
    const m = meter.current
    if (
      fixed !== null ||
      document.hidden ||
      !gl.domElement.dataset.rendered ||
      m.pose.equals(camera.matrixWorld)
    )
      return
    m.pose.copy(camera.matrixWorld)
    if (dt <= 0 || dt > 0.05 || performance.now() - dt * 1000 < m.lastTaskEnd) return
    m.frames.push(dt)
    if (m.frames.length < 90) return
    const ms = m.frames.sort((a, b) => a - b)[45] * 1000
    m.frames.length = 0
    m.fast = ms < 17.2 ? m.fast + 1 : 0
    m.slow = ms > 23 ? m.slow + 1 : 0
    const next = Math.max(
      0.75,
      Math.min(devicePixelRatio, 1.5, m.dpr + (m.slow >= 2 ? -0.0625 : m.fast >= 8 ? 0.0625 : 0)),
    )
    if (next !== m.dpr) {
      m.dpr = next
      m.fast = m.slow = 0
      setDpr(next)
    }
  })
  return <Quality.Provider value={tier}>{children}</Quality.Provider>
}

export function SunShadows({ rt }: { rt: SurveyRuntime }) {
  const { scene, gl, get } = useThree()
  const tier = useQuality(),
    csm = useRef<CSM | null>(null)
  const fill = useRef<DirectionalLight>(null),
    projection = useRef(new Matrix4()),
    eye = useRef(new Vector3()),
    turn = useRef(new Quaternion())
  const time = useShelterStore((s) => s.time),
    cold = useShelterStore((s) => s.cold)
  const outdoors = useShelterStore((s) => s.mode === 'exterior' && s.cameraState === 'site')
  useLayoutEffect(() => {
    const chunks = [ShaderChunk.lights_pars_begin, ShaderChunk.lights_fragment_begin]
    const shadows = new CSM({
      camera: get().camera,
      parent: scene,
      cascades: 3,
      maxFar: 520,
      shadowMapSize: tier.shadow,
      mode: 'practical',
      lightDirection: sunAt(time).negate(),
      shadowBias: -0.00014,
      lightMargin: 90,
    })
    type CascadeMaterial = MeshStandardMaterial & { defines: Record<string, number> }
    const bound = new Set<CascadeMaterial>()
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || !(o.material instanceof MeshStandardMaterial)) return
      const mat = o.material as CascadeMaterial
      if (bound.has(mat)) return
      bound.add(mat)
      mat.defines.USE_CSM = 1
      mat.defines.CSM_CASCADES = 3
      mat.needsUpdate = true
    })
    for (const l of shadows.lights) l.shadow.normalBias = 0.035
    csm.current = shadows
    return () => {
      csm.current = null
      shadows.remove()
      shadows.dispose()
      shadows.lights.forEach((l) => l.dispose())
      for (const m of bound) {
        delete m.defines.USE_CSM
        delete m.defines.CSM_CASCADES
        m.needsUpdate = true
      }
      ;[ShaderChunk.lights_pars_begin, ShaderChunk.lights_fragment_begin] = chunks
    }
  }, [scene, get, tier])
  useLayoutEffect(() => {
    const s = csm.current!
    const sun = sunAt(time)
    s.lightDirection.copy(sun).negate()
    for (const l of s.lights) {
      l.color.set(cold ? '#eaf4ff' : sun.y < 0.18 ? '#ffcd94' : '#fff1dc')
    }
    gl.shadowMap.needsUpdate = outdoors
  }, [outdoors, cold, time, gl])
  useFrame(({ camera }) => {
    const s = csm.current
    if (!s) return
    const sunlight = outdoors && !(rt.garageTransfer && camera.position.y < 0)
    for (const light of s.lights) light.intensity = sunlight ? (cold ? 1.1 : 2.75) : 0
    if (fill.current) fill.current.intensity = sunlight ? 0 : 0.91
    if (!sunlight) {
      gl.shadowMap.needsUpdate = false
      return
    }
    if (s.camera !== camera || !projection.current.equals(camera.projectionMatrix)) {
      s.camera = camera
      projection.current.copy(camera.projectionMatrix)
      s.updateFrustums()
      camera.projectionMatrix.copy(projection.current)
      camera.projectionMatrixInverse.copy(projection.current).invert()
      s.breaks.forEach((end, i) => shadowUniforms.CSM_cascades.value[i].set(s.breaks[i - 1] ?? 0, end))
      shadowUniforms.cameraNear.value = camera.near
      shadowUniforms.shadowFar.value = Math.min(camera.far, s.maxFar)
      gl.shadowMap.needsUpdate = true
    }
    if (
      gl.shadowMap.needsUpdate ||
      !eye.current.equals(camera.position) ||
      !turn.current.equals(camera.quaternion)
    ) {
      s.update()
      gl.shadowMap.needsUpdate = true
      eye.current.copy(camera.position)
      turn.current.copy(camera.quaternion)
    }
  }, -0.2)
  return (
    <directionalLight
      ref={fill}
      position={[-12, 19, 32]}
      color={time === '19:30' ? '#a2bfe8' : '#e6edf2'}
      intensity={outdoors ? 0 : 0.91}
    />
  )
}

export function RenderPipeline({ rt }: { rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    get = useThree((s) => s.get),
    size = useThree((s) => s.size),
    dpr = useThree((s) => s.viewport.dpr),
    tier = useQuality()
  const pipeline = useRef<{ pipe: EffectComposer; ao: N8AOPostPass; camera: Camera } | null>(null)
  const startup = useRef(0),
    fence = useRef<WebGLSync | null>(null)
  useLayoutEffect(() => {
    const camera = get().camera,
      canvas = gl.domElement
    const pipe = new EffectComposer(gl, {
      frameBufferType: HalfFloatType,
      depthBuffer: true,
      stencilBuffer: true,
    })
    const render = new RenderPass(scene, camera)
    render.clearPass.setClearFlags(true, true, true)
    pipe.addPass(render)
    const ao = new N8AOPostPass(scene, camera, Math.max(2, canvas.width), Math.max(2, canvas.height))
    ao.autoDetectTransparency = false
    ao.configuration.gammaCorrection = false
    ao.configuration.halfRes = true
    ao.setQualityMode('Low')
    ao.configuration.intensity = 1.6
    pipe.addPass(ao)
    const bloom = new SelectiveBloomEffect(scene, camera, {
      luminanceThreshold: 0.66,
      luminanceSmoothing: 0.12,
      intensity: 0.31,
      mipmapBlur: true,
      levels: 4,
    })
    bloom.ignoreBackground = true
    scene.traverse((o) => {
      if (o.userData.finish === 'lamp' || o.userData.emits) bloom.selection.add(o)
    })
    pipe.addPass(new EffectPass(camera, bloom))
    pipe.addPass(
      new EffectPass(
        camera,
        new SMAAEffect({ preset: SMAAPreset.LOW }),
        new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
      ),
    )
    pipeline.current = { pipe, ao, camera }
    gl.toneMapping = AgXToneMapping
    gl.info.autoReset = false
    return () => {
      pipeline.current = null
      if (fence.current) (gl.getContext() as WebGL2RenderingContext).deleteSync(fence.current)
      bloom.selection.clear()
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
  }, [gl, scene, get, tier])
  useLayoutEffect(() => {
    pipeline.current?.pipe.setSize(size.width, size.height)
  }, [size, dpr])
  useFrame(({ camera }, dt) => {
    const p = pipeline.current
    if (!p) return
    const { pipe, ao } = p,
      canvas = gl.domElement,
      state = useShelterStore.getState()
    if (startup.current === 0) {
      performance.mark('ars-open-scene')
      precompileSurvey(gl, scene, camera, pipe, ao)
      p.camera = camera
      gl.shadowMap.needsUpdate = true
    }
    if (p.camera !== camera || canvas.dataset.pipelineRevision !== String(state.cameraRevision)) {
      pipe.setMainCamera(camera)
      ao.camera = camera
      p.camera = camera
      canvas.dataset.pipelineRevision = String(state.cameraRevision)
    }
    ao.enabled = tier.ao && state.mode !== 'xray'
    ao.configuration.aoRadius = state.cameraState === 'walkthrough' ? 0.55 : 1.8
    if (state.mode !== 'exterior' || (rt.garageTransfer && camera.position.y < 0))
      gl.shadowMap.needsUpdate = false
    gl.info.reset()
    pipe.render(Math.min(dt, 0.1))
    canvas.dataset.mode = state.mode
    canvas.dataset.calls = String(gl.info.render.calls)
    canvas.dataset.triangles = String(gl.info.render.triangles)
    canvas.dataset.eye = camera.position
      .toArray()
      .map((n) => n.toFixed(4))
      .join(',')
    const context = gl.getContext() as WebGL2RenderingContext
    if (++startup.current === 1) {
      fence.current = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0)
      context.flush()
    } else if (
      !canvas.dataset.rendered &&
      fence.current &&
      context.getSyncParameter(fence.current, context.SYNC_STATUS) === context.SIGNALED
    ) {
      context.deleteSync(fence.current)
      fence.current = null
      performance.mark('ars-open-ready')
      canvas.dataset.rendered = 'true'
      window.dispatchEvent(new Event('ars-ready'))
    }
  }, 1)
  return null
}
