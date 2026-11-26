import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { Component, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap, PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CameraRig } from './CameraRig'
import type { Instruments } from './CameraRig'
import { SurfaceStation } from './SurfaceStation'
import { UndergroundShell } from './UndergroundShell'
import { MultiScaleMountain } from './terrain/MultiScaleMountain'
import { SiteFacilities, TunnelModels } from './terrain/SiteFacilities'
import { AtlasLoader } from './terrain/loadAtlas'
import { BuildingSection } from './BuildingSection'
import { useShelterStore } from '../store/useShelterStore'
import { PerspectiveCamera } from '@react-three/drei'

function SurveyScene({ instruments }: { instruments: Instruments }) {
  const atlas = useLoader(AtlasLoader, import.meta.env.BASE_URL + 'terrain/atlas.json')
  const mode = useShelterStore((s) => s.mode),
    floor = useShelterStore((s) => s.floor)
  const exterior = mode === 'exterior' && floor === 'ALL'
  return (
    <>
      <color attach="background" args={[exterior ? '#c7d4da' : mode === 'xray' ? '#263438' : '#e5e8e1']} />
      {exterior && <fogExp2 attach="fog" args={['#c2ced5', 0.00039]} />}
      {exterior && <PerspectiveCamera makeDefault fov={25} near={0.35} far={15000} />}
      <MultiScaleMountain atlas={atlas} />
      <BuildingSection>
        <UndergroundShell />
        <SurfaceStation />
        <TunnelModels />
      </BuildingSection>
      <SiteFacilities atlas={atlas} />
      <CameraRig instruments={instruments} atlas={atlas} />
    </>
  )
}

function GraphicsMessage() {
  return (
    <div className="graphics-message" role="alert">
      <strong>三维视口未能启动</strong>
      <p>请在浏览器中开启图形加速，然后刷新页面。</p>
    </div>
  )
}

function StudioReflections() {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const studio = new RoomEnvironment(),
      generator = new PMREMGenerator(gl)
    const target = generator.fromScene(studio, 0.04)
    studio.dispose()
    generator.dispose()
    const previous = scene.environment,
      strength = scene.environmentIntensity
    scene.environment = target.texture
    scene.environmentIntensity = 0.32
    invalidate()
    return () => {
      scene.environment = previous
      scene.environmentIntensity = strength
      target.dispose()
    }
  }, [gl, scene, invalidate])
  return null
}

class GraphicsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <GraphicsMessage /> : this.props.children
  }
}

export function ShelterCanvas({ instruments }: { instruments: Instruments }) {
  return (
    <GraphicsBoundary>
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 1.5]}
        shadows={{ type: PCFSoftShadowMap }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true
          gl.shadowMap.autoUpdate = false
          gl.shadowMap.needsUpdate = true
        }}
        camera={{ position: [-48, 26, 68], near: 0.1, far: 15000, zoom: 10 }}
        gl={{
          antialias: true,
          alpha: false,
          stencil: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
        fallback={<GraphicsMessage />}
      >
        <StudioReflections />
        <hemisphereLight args={['#d6e5f4', '#6b716b', 0.86]} />
        <directionalLight
          position={[-39, 52, 32]}
          color="#fff1db"
          intensity={2.05}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-48}
          shadow-camera-right={48}
          shadow-camera-top={45}
          shadow-camera-bottom={-45}
          shadow-camera-near={0.5}
          shadow-camera-far={130}
          shadow-normalBias={0.035}
          shadow-bias={-0.00018}
        />
        <directionalLight position={[24, 20, -34]} intensity={0.5} color="#c9e0f2" />
        <SurveyScene instruments={instruments} />
      </Canvas>
    </GraphicsBoundary>
  )
}
