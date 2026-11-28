import { circadianAt } from '../../data/lighting'
import { usePhotoMode } from '../../store/usePhotoMode'
import { PhotographicDepth, shiftLens } from '../photo/photographicLens'
import { capturePhotograph, exposureProcessor } from '../photo/capturePhotograph'
import { shadowPasses } from './roomShadows'
import { floorAt } from '../../geometry/viewGeometry'
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
  type Object3D,
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
import { SurveyAmbientOcclusion } from './SurveyAmbientOcclusion'
import { useShelterStore } from '../../store/useShelterStore'
import { emergencyCircuit } from '../materials/pbrLibrary'
import { shadowUniforms } from './shadowUniforms'
import { ScenarioGrade } from './ScenarioGrade'
import { useOperationsStore } from '../../store/useOperationsStore'
import { sunAt } from './PhysicalSky'

// Glow contains only the soft halo of selected fixtures. Their hard edges, depth,
// room reflections and the final image still use the full drawing buffer.
class FixtureBloom extends SelectiveBloomEffect {
  collectFixtures(scene: Object3D) {
    this.selection.clear()
    scene.traverse(object => {
      if (object.userData.finish === 'lamp' || object.userData.emits) this.selection.add(object)
    })
  }

  hasVisibleFixture() {
    for (const fixture of this.selection) {
      let ancestor: Object3D | null = fixture
      while (ancestor?.visible) ancestor = ancestor.parent
      if (!ancestor) return true
    }
    return false
  }

  override setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)))
  }
}

const tiers = [
  { dpr: 0.75, shadow: 512, ao: false, trees: 125 },
  { dpr: 1, shadow: 768, ao: true, trees: 220 },
  { dpr: 1.25, shadow: 1024, ao: true, trees: 340 },
  { dpr: 1.5, shadow: 1024, ao: true, trees: 380 },
]
const Quality = createContext(tiers[3])
export const useQuality = () => useContext(Quality)
export function QualityControl({
  children,
  onDprChange,
}: {
  children: ReactNode
  onDprChange: (dpr: number) => void
}) {
  const fixed = useMemo(() => {
    const param = new URLSearchParams(location.search).get('quality')
    return param !== null && /^[0-3]$/.test(param) ? Number(param) : null
  }, [])
  const tier = tiers[fixed ?? 3]
  const meter = useRef({
    dpr: Math.min(devicePixelRatio, tier.dpr),
    pose: new Matrix4(),
    frames: [] as number[],
    lastTaskEnd: 0,
    fast: 0,
    slow: 0,
  })
  useLayoutEffect(() => {
    onDprChange(meter.current.dpr)
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return
    const observer = new PerformanceObserver((list) => {
      for (const task of list.getEntries()) meter.current.lastTaskEnd = task.startTime + task.duration
    })
    observer.observe({ type: 'longtask' })
    return () => observer.disconnect()
  }, [onDprChange])
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
      // Canvas owns the configured ratio, including when a view change reconfigures the R3F root.
      onDprChange(next)
    }
  })
  return <Quality.Provider value={tier}>{children}</Quality.Provider>
}

// An inactive Three light has a zero RGB uniform. Keep it in the same program layout, but
// bypass the analytic area integral, local BRDF and spot PCF before they touch any samplers.
function skipUnlitEmitters(source: string) {
  for (const name of ['pointLight', 'spotLight', 'rectAreaLight']) {
    const assignment = name + ' = ' + name + 's[ i ];'
    const start = source.indexOf(assignment) + assignment.length
    const end = source.indexOf('\n\t}\n\t#pragma unroll_loop_end', start)
    if (start < assignment.length || end < 0) throw new Error('Unexpected CSM shader loop: ' + name)
    let body = source.slice(start, end)
    if (name === 'rectAreaLight') {
      // The stock rectangle uses local -Z. Its non-emitting side and a rectangle entirely
      // below the receiving hemisphere have zero direct radiance. The area BRDF in r180
      // evaluates base diffuse/specular only (glass transmission remains in its own pass).
      body = body.replace(
        'RE_Direct_RectArea(',
        `
        vec3 rectOffset = rectAreaLight.position - geometryPosition;
        float furthest = dot(geometryNormal,rectOffset)
          + abs(dot(geometryNormal,rectAreaLight.halfWidth)) + abs(dot(geometryNormal,rectAreaLight.halfHeight));
        if (furthest > 0.0 && dot(rectOffset,cross(rectAreaLight.halfWidth,rectAreaLight.halfHeight)) >= 0.0)
          RE_Direct_RectArea(`,
      )
    } else {
      // Test the unnormalised vector before attenuation and PCF. Back-facing or out-of-range
      // receivers contribute nothing to either the base or clear-coat BRDF.
      body = `
        vec3 toEmitter = ${name}.position - geometryPosition;
        if (max(dot(geometryNormal, toEmitter), dot(geometryClearcoatNormal, toEmitter)) > 0.0
            && (${name}.distance == 0.0 || dot(toEmitter, toEmitter) < ${name}.distance * ${name}.distance)) {
          ${body.replace('RE_Direct(', 'if (directLight.visible) RE_Direct(')}
        }
      `
    }
    source =
      source.slice(0, start) +
      '\n if (any(greaterThan(' +
      name +
      '.color,vec3(0.)))) {' +
      body +
      '\n }' +
      source.slice(end)
  }
  // All three CSM cascades describe one sun. Keep the following non-shadowing fill
  // outside this guard; on an underground walk it is the only active directional light.
  const cascades = '#if defined( USE_SHADOWMAP ) && defined( CSM_FADE )'
  const fill = '#if ( NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS)'
  if (!source.includes(cascades) || !source.includes(fill)) throw new Error('Unexpected CSM cascade layout')
  return source
    .replace(cascades, 'if(any(greaterThan(directionalLights[0].color,vec3(0.)))) {\n' + cascades)
    .replace(fill, '}\n' + fill)
}

export function SunShadows() {
  const { scene, gl, get } = useThree()
  const tier = useQuality(),
    csm = useRef<CSM | null>(null)
  const fill = useRef<DirectionalLight>(null),
    projection = useRef(new Matrix4()),
    eye = useRef(new Vector3()),
    turn = useRef(new Quaternion())
  const time = useShelterStore((s) => s.time),
    cold = useShelterStore((s) => s.cold)
  const sun = useMemo(() => sunAt(time), [time])
  const night = useMemo(() => circadianAt(time).night, [time])
  const sunlightGain = Math.max(0, Math.min(1, sun.y / 0.12))
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
      shadowBias: -0.00016,
      lightMargin: 90,
    })
    ShaderChunk.lights_fragment_begin = skipUnlitEmitters(ShaderChunk.lights_fragment_begin)
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
    for (const l of shadows.lights) {
      l.shadow.normalBias = 0.04
      l.shadow.autoUpdate = false
      l.shadow.needsUpdate = true
    }
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
    s.lightDirection.copy(sun).negate()
    for (const l of s.lights) {
      l.color.set(cold ? '#eaf4ff' : sun.y < 0.18 ? '#ffcd94' : '#fff1dc')
    }
    for (const l of s.lights) l.shadow.needsUpdate = outdoors && sunlightGain > 0
    gl.shadowMap.needsUpdate = outdoors && sunlightGain > 0
  }, [outdoors, cold, sun, sunlightGain, gl])
  useFrame(({ camera }) => {
    const s = csm.current
    if (!s) return
    const sunlight = outdoors && sunlightGain > 0
    for (const light of s.lights) light.intensity = sunlight ? (cold ? 1.1 : 2.75) * sunlightGain : 0
    if (fill.current) {
      const living =
        useShelterStore.getState().cameraState === 'walkthrough' && floorAt(camera.position.y - 1.65) === 'B2'
      const emergency = useShelterStore.getState().cameraState === 'walkthrough' && camera.position.y < 0 && emergencyCircuit.value > 0
      fill.current.intensity = outdoors ? 0 : emergency ? 0.06 : living ? (night ? 0.025 : 0.22) : 0.91
    }
    if (!sunlight) {
      gl.shadowMap.needsUpdate = false
      for (const l of s.lights) l.shadow.needsUpdate = false
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
      for (const l of s.lights) l.shadow.needsUpdate = true
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

export function RenderPipeline() {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    get = useThree((s) => s.get),
    size = useThree((s) => s.size),
    dpr = useThree((s) => s.viewport.dpr),
    tier = useQuality()
  const pipeline = useRef<{
    pipe: EffectComposer
    ao: SurveyAmbientOcclusion
    camera: Camera
    grade: ScenarioGrade
    bloom: FixtureBloom
    glow: EffectPass
    depthOfField: EffectPass
    depth: PhotographicDepth
    exposure: ReturnType<typeof exposureProcessor>
    shadows: ReturnType<typeof shadowPasses>
  } | null>(null)
  const lens = useMemo(shiftLens, [])
  const installedRooms = useShelterStore(s => s.installedRooms)
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
    // Only the scene pass writes depth and section-cap stencil, always to inputBuffer.
    // The second HDR target holds fullscreen colour results, including the photo export.
    pipe.outputBuffer.depthBuffer = false
    pipe.outputBuffer.stencilBuffer = false
    const render = new RenderPass(scene, camera)
    render.clearPass.setClearFlags(true, true, true)
    pipe.addPass(render)
    const ao = new SurveyAmbientOcclusion(scene, camera, pipe)
    ao.autoDetectTransparency = false
    ao.configuration.gammaCorrection = false
    ao.configuration.halfRes = true
    ao.setQualityMode('Low')
    // Ignore sub-centimetre surface noise; keep the half-resolution depth-aware blur on real edges.
    ao.configuration.biasOffset = 0.008
    ao.configuration.biasMultiplier = 0.25
    ao.configuration.intensity = 1.45
    pipe.addPass(ao)
    const bloom = new FixtureBloom(scene, camera, {
      luminanceThreshold: 0.66,
      luminanceSmoothing: 0.12,
      intensity: 0.31,
      mipmapBlur: true,
      levels: 4,
    })
    bloom.ignoreBackground = true
    const glow = new EffectPass(camera, bloom)
    pipe.addPass(glow)
    const depth = new PhotographicDepth()
    const depthOfField = new EffectPass(camera, depth)
    pipe.addPass(depthOfField)
    depthOfField.enabled = false
    const grade = new ScenarioGrade()
    pipe.addPass(
      new EffectPass(
        camera,
        new SMAAEffect({ preset: SMAAPreset.LOW }),
        new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
        grade,
      ),
    )
    const exposure = exposureProcessor()
    const abort = new AbortController()
    pipeline.current = { pipe, ao, camera, grade, bloom, glow, depthOfField, depth, exposure, shadows: shadowPasses(scene) }
    let capturing = false
    async function exportPhoto() {
      if (capturing) return
      const photo = usePhotoMode.getState()
      if (!photo.active || !canvas.dataset.rendered) {
        usePhotoMode.setState({ exporting: false })
        return
      }
      capturing = true
      const root = get()
      const view = root.camera, loop = root.frameloop, elapsed = root.clock.elapsedTime
      root.setFrameloop('never')
      lens.apply(view, photo.shift)
      try {
        const { blob, width, height } = await capturePhotograph(gl, view, pipe, exposure, photo.aspect, abort.signal)
        abort.signal.throwIfAborted()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `ARS-01_${useShelterStore.getState().lastFloor}_${width}x${height}.png`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 30_000)
        usePhotoMode.setState({ message: `${width} × ${height} px · 16 帧` })
      } catch (error) {
        if (!abort.signal.aborted)
          usePhotoMode.setState({ message: '导出失败 · ' + (error instanceof Error ? error.message : String(error)) })
      } finally {
        lens.restore(view)
        if (!abort.signal.aborted) {
          root.setFrameloop(loop)
          root.clock.elapsedTime = elapsed
          pipe.setSize(get().size.width, get().size.height)
          root.invalidate()
        }
        usePhotoMode.setState({ exporting: false })
        capturing = false
      }
    }
    window.addEventListener('ars-export-photo', exportPhoto)
    gl.toneMapping = AgXToneMapping
    gl.info.autoReset = false
    return () => {
      window.removeEventListener('ars-export-photo', exportPhoto)
      abort.abort()
      exposure.dispose()
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
  }, [gl, scene, get, tier, lens])
  useLayoutEffect(() => {
    pipeline.current?.bloom.collectFixtures(scene)
  }, [scene, installedRooms])
  useLayoutEffect(() => {
    if (!usePhotoMode.getState().exporting) pipeline.current?.pipe.setSize(size.width, size.height)
  }, [size, dpr])
  useFrame(({ camera }, dt) => {
    const p = pipeline.current
    if (!p) return
    const { pipe, ao } = p,
      canvas = gl.domElement,
      state = useShelterStore.getState()
    if (startup.current === 0) {
      performance.mark('ars-open-scene')
      precompileSurvey(gl, scene, camera, pipe, ao, p.depthOfField, p.exposure)
      p.camera = camera
      gl.shadowMap.needsUpdate = true
    }
    if (p.camera !== camera || canvas.dataset.pipelineRevision !== String(state.cameraRevision)) {
      pipe.setMainCamera(camera)
      ao.camera = camera
      p.camera = camera
      canvas.dataset.pipelineRevision = String(state.cameraRevision)
    }
    const scenario = useOperationsStore.getState().scenario
    p.grade.transition(scenario === 'normal' && state.cold ? 'cryo' : scenario, dt)
    ao.enabled = tier.ao && state.mode !== 'xray'
    const closeInterior = state.cameraState === 'walkthrough' && camera.position.y < -6
    ao.configuration.aoRadius = closeInterior ? 0.32 : state.cameraState === 'walkthrough' ? 0.55 : 1.8
    ao.configuration.intensity = closeInterior ? 1.75 : 1.45
    const photo = usePhotoMode.getState()
    // With the background masked out, hidden emitters contribute exactly zero bloom.
    p.glow.enabled = p.bloom.hasVisibleFixture()
    p.depthOfField.enabled = photo.active
    p.depth.focus.value = state.cameraState === 'walkthrough' ? 3.5 : state.cameraState === 'site' ? 85 : 22
    canvas.dataset.photoMode = photo.active ? 'on' : 'off'
    gl.info.reset()
    lens.apply(camera, photo.active && photo.shift)
    try {
      p.shadows(gl, floorAt(camera.position.y - 1.65), () => pipe.render(Math.min(dt, 0.1)))
    } finally { lens.restore(camera) }
    canvas.dataset.mode = state.mode
    canvas.dataset.calls = String(gl.info.render.calls)
    canvas.dataset.triangles = String(gl.info.render.triangles)
    canvas.dataset.eye = camera.position
      .toArray()
      .map((n) => n.toFixed(4))
      .join(',')
    if (
      state.shot &&
      canvas.dataset.ready === 'settled' &&
      canvas.dataset.photoRevision !== canvas.dataset.revision
    ) {
      // Record the actual rendered pose, projection and exposure once per settled photograph.
      canvas.dataset.photoSettings = JSON.stringify({
        world: camera.matrixWorld.toArray(),
        projection: camera.projectionMatrix.toArray(),
        exposure: gl.toneMappingExposure,
        dpr: gl.getPixelRatio(),
      })
      canvas.dataset.photoRevision = canvas.dataset.revision
    }
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
