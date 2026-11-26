import { Canvas, useLoader } from '@react-three/fiber'
import { Component, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AgXToneMapping, PCFSoftShadowMap } from 'three'
import { InteriorLights } from './rooms/RoomInteriors'
import { FibreDaylight } from './rooms/FibreDaylight'
import { SurfaceStation } from './SurfaceStation'
import { UndergroundShell } from './UndergroundShell'
import { MultiScaleMountain } from './terrain/MultiScaleMountain'
import { SiteFacilities, TunnelModels } from './terrain/SiteFacilities'
import { AtlasLoader } from './terrain/loadAtlas'
import { BuildingSection } from './BuildingSection'
import { useShelterStore } from '../store/useShelterStore'
import { PhysicalSky } from './atmosphere/PhysicalSky'
import { QualityControl, RenderPipeline, SunShadows } from './atmosphere/RenderPipeline'
import { CameraStateMachine } from './camera/CameraStateMachine'
import { WalkthroughRig } from './camera/WalkthroughRig'
import { SectionBoxTool } from './camera/SectionBoxTool'
import { SceneReadouts } from './camera/SceneReadouts'
import { surveyRuntime } from './camera/runtime'
import { DrawingMarks } from './DrawingMarks'
import { CoreTraces } from './CoreTraces'

function SurveyScene() {
  const atlas = useLoader(AtlasLoader, import.meta.env.BASE_URL + 'terrain/atlas.json')
  const rt = useMemo(surveyRuntime, [])
  const xray = useShelterStore((s) => s.mode === 'xray')
  const structure = useShelterStore((s) => s.layers.structure)
  return (
    <QualityControl>
      <PhysicalSky />
      <MultiScaleMountain atlas={atlas} />
      <group visible={!xray || structure}>
        <BuildingSection>
          <UndergroundShell rt={rt} />
          <SurfaceStation atlas={atlas} rt={rt} />
          <TunnelModels />
        </BuildingSection>
      </group>
      <SiteFacilities atlas={atlas} />
      <group visible={xray}>
        <CoreTraces />
      </group>
      <group visible={!xray}>
        <DrawingMarks />
      </group>
      <InteriorLights />
      <FibreDaylight />
      <CameraStateMachine atlas={atlas} rt={rt} />
      <WalkthroughRig rt={rt} />
      <SectionBoxTool rt={rt} />
      <SceneReadouts rt={rt} />
      <SunShadows rt={rt} />
      <RenderPipeline rt={rt} />
    </QualityControl>
  )
}
function GraphicsMessage() {
  return (
    <div className="graphics-message" role="alert">
      <strong>三维视口未能启动</strong>
      <p>请开启浏览器图形加速，再刷新页面。</p>
    </div>
  )
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
export function ShelterCanvas() {
  return (
    <GraphicsBoundary>
      <Canvas
        dpr={Math.min(devicePixelRatio, 1.25)}
        shadows={{ type: PCFSoftShadowMap }}
        camera={{ position: [-88, 19, -41], near: 0.5, far: 15000, fov: 23 }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true
          gl.shadowMap.autoUpdate = false
          gl.shadowMap.needsUpdate = true
        }}
        gl={{
          antialias: false,
          alpha: false,
          stencil: true,
          powerPreference: 'high-performance',
          toneMapping: AgXToneMapping,
          toneMappingExposure: 1.05,
        }}
        fallback={<GraphicsMessage />}
      >
        <SurveyScene />
      </Canvas>
    </GraphicsBoundary>
  )
}
