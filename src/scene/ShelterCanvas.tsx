import { ShiftActivity } from './ambiance/ShiftActivity'
import { Soundscape } from './ambiance/Soundscape'
import { TourDirector } from './camera/TourDirector'
import { PilotPreload } from './assets/PilotPreload'
import { Canvas } from '@react-three/fiber'
import { Component, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AgXToneMapping, PCFSoftShadowMap } from 'three'
import { InteriorLights } from './rooms/RoomInteriors'
import { FibreDaylight } from './rooms/FibreDaylight'
import { SurfaceStation } from './SurfaceStation'
import { UndergroundShell } from './UndergroundShell'
import { MultiScaleMountain } from './terrain/MultiScaleMountain'
import { StationClosures } from './terrain/StationClosures'
import { SiteFacilities, TunnelModels } from './terrain/SiteFacilities'
import { useTerrainSurvey } from './terrain/useTerrainSurvey'
import { BuildingSection } from './BuildingSection'
import { useShelterStore } from '../store/useShelterStore'
import { LockdownTourCamera } from './atmosphere/LockdownTour'
import { DeconGauge } from './atmosphere/DeconGauge'
import { InteriorLightPool } from './atmosphere/InteriorLightPool'
import { PhysicalSky } from './atmosphere/PhysicalSky'
import { QualityControl, RenderPipeline, SunShadows } from './atmosphere/RenderPipeline'
import { CameraStateMachine } from './camera/CameraStateMachine'
import { WalkthroughRig } from './camera/WalkthroughRig'
import { SectionBoxTool } from './camera/SectionBoxTool'
import { SceneReadouts } from './camera/SceneReadouts'
import { surveyRuntime } from './camera/runtime'
import { DrawingMarks } from './DrawingMarks'
import { MepNetworkScene } from './mep/MepNetworkScene'

function SurveyScene({ onDprChange }: { onDprChange: (dpr: number) => void }) {
  const { atlas, surface } = useTerrainSurvey()
  const rt = useMemo(surveyRuntime, [])
  const xray = useShelterStore((s) => s.mode === 'xray')
  const routeOverview = useShelterStore(s => s.routeOverview)
  const structure = useShelterStore((s) => s.layers.structure)
  return (
    <PilotPreload>
      {atlas && <QualityControl onDprChange={onDprChange}>
        <PhysicalSky />
        <MultiScaleMountain atlas={atlas} surface={surface} />
        <group visible={routeOverview || !xray || structure}>
          <BuildingSection>
            <UndergroundShell rt={rt} />
            <ShiftActivity rt={rt} />
            <SurfaceStation atlas={atlas} rt={rt} />
            <group visible={!routeOverview}><TunnelModels /></group>
          </BuildingSection>
        </group>
        <group visible={!routeOverview}><SiteFacilities atlas={atlas} /></group>
        <StationClosures atlas={atlas} />
        <MepNetworkScene atlas={atlas} rt={rt} />
        <group visible={!xray}>
          <DrawingMarks />
        </group>
        <InteriorLights />
        <FibreDaylight />
        <DeconGauge />
        <LockdownTourCamera />
        <InteriorLightPool rt={rt} />
        <CameraStateMachine atlas={atlas} rt={rt} />
        <WalkthroughRig rt={rt} />
        <SectionBoxTool rt={rt} />
        <TourDirector rt={rt} />
        <Soundscape />
        <SceneReadouts rt={rt} />
        <SunShadows rt={rt} />
        <RenderPipeline />
      </QualityControl>}
    </PilotPreload>
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
  const [dpr, setDpr] = useState(() => Math.min(devicePixelRatio, 1.5))
  const scene = useMemo(() => <SurveyScene onDprChange={setDpr} />, [])
  return (
    <GraphicsBoundary>
      <Canvas
        dpr={dpr}
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
        {scene}
      </Canvas>
    </GraphicsBoundary>
  )
}
