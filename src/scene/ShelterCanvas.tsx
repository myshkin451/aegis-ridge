import { Canvas, useLoader } from '@react-three/fiber'
import { Component, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AgXToneMapping, PCFSoftShadowMap } from 'three'
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
  const view = useShelterStore((s) => s.cameraState),
    xray = useShelterStore((s) => s.mode === 'xray')
  const structure = useShelterStore((s) => s.layers.structure)
  return (
    <QualityControl>
      <PhysicalSky />
      <MultiScaleMountain atlas={atlas} />
      <group visible={!xray || structure}>
        <BuildingSection>
          <UndergroundShell />
          <SurfaceStation />
          <TunnelModels />
        </BuildingSection>
      </group>
      <SiteFacilities atlas={atlas} />
      {xray ? <CoreTraces /> : <DrawingMarks />}
      <CameraStateMachine atlas={atlas} rt={rt} />
      {view === 'walkthrough' && <WalkthroughRig rt={rt} />}
      {view === 'sectionBox' && <SectionBoxTool rt={rt} />}
      <SceneReadouts rt={rt} />
      <SunShadows />
      <RenderPipeline />
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
        dpr={[1, 1.5]}
        shadows={{ type: PCFSoftShadowMap }}
        camera={{ position: [-88, 19, -41], near: 0.07, far: 16000, fov: 23 }}
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
