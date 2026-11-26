import { Canvas, useThree } from '@react-three/fiber'
import { Component, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { ACESFilmicToneMapping, PCFSoftShadowMap, PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CameraRig } from './CameraRig'
import type { Instruments } from './CameraRig'
import { SurfaceStation } from './SurfaceStation'
import { UndergroundShell } from './UndergroundShell'
import { TerrainMountain } from './TerrainMountain'
import { BED } from './terrainGeometry'
import { ModelBuilder } from './utils/modelBuilder'
import { Model } from './utils/Model'

function surveyGrid() {
  const m = new ModelBuilder(),
    y = BED - 0.28
  for (let i = -65; i <= 65; i += 5)
    for (let k = -65; k <= 65; k += 5) {
      const dist = Math.hypot(i / 67, k / 53)
      if (dist > 1) continue
      const length = 0.14 + 0.18 * (1 - dist)
      m.line([i - length, y, k], [i + length, y, k], '#394650')
      m.line([i, y, k - length], [i, y, k + length], '#394650')
    }
  return m
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
    const target = generator.fromScene(studio, 0.06)
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
        dpr={[1, 1.65]}
        shadows={{ type: PCFSoftShadowMap }}
        onCreated={({ gl }) => {
          gl.shadowMap.autoUpdate = false
          gl.shadowMap.needsUpdate = true
        }}
        camera={{ position: [-48, 26, 68], near: 0.1, far: 330, zoom: 10 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
        fallback={<GraphicsMessage />}
      >
        <StudioReflections />
        <hemisphereLight args={['#d6e5f4', '#767977', 1.1]} />
        <directionalLight
          position={[-39, 52, 32]}
          color="#fff1db"
          intensity={2.4}
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
        <directionalLight position={[24, 20, -34]} intensity={0.95} color="#c9e0f2" />
        <mesh rotation-x={-Math.PI / 2} position-y={BED - 0.3} receiveShadow>
          <planeGeometry args={[300, 300]} />
          <shadowMaterial transparent opacity={0.27} depthWrite={false} />
        </mesh>
        <Model build={surveyGrid} />
        <TerrainMountain />
        <UndergroundShell />
        <SurfaceStation />
        <CameraRig instruments={instruments} />
      </Canvas>
    </GraphicsBoundary>
  )
}
