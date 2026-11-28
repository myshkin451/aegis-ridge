import { useThree } from '@react-three/fiber'
import { setSurfaceSampling } from '../materials/surfaceSampling'
import { useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { ModelBuilder } from '../utils/modelBuilder'
import { Model } from '../utils/Model'
import { useBuildingCut } from '../BuildingSection'
import { FLOORS } from '../../data/floors'
import { footprint } from '../../geometry/coords'
import type { FloorId } from '../../types/shelter'

/** A recessed end-wall installation. A single atlas holds the artificial view and the cabinet faces. */
function endWall(id: FloorId, maxAnisotropy: number) {
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = '#45504f'
  g.fillRect(0, 0, 768, 1024)
  const sky = g.createLinearGradient(0, 0, 0, 620)
  sky.addColorStop(0, '#7ba9c8')
  sky.addColorStop(0.67, '#dae8e7')
  sky.addColorStop(1, '#f2dfba')
  g.fillStyle = sky
  g.fillRect(17, 20, 734, 578)
  g.save()
  g.beginPath()
  g.rect(17, 20, 734, 578)
  g.clip()
  for (let k = 0; k < 4; k++) {
    g.fillStyle = ['#a8bfcb', '#8ca5b5', '#748e9e', '#526d75'][k]
    g.beginPath()
    g.moveTo(0, 615)
    for (let x = 0; x <= 780; x += 3) {
      const t = x / 150 + k * 2.7 + id.charCodeAt(1)
      g.lineTo(x, 330 + k * 62 + 65 * Math.sin(t * 1.2) + 20 * Math.sin(t * 3.8) + 8 * Math.cos(t * 7.9))
    }
    g.lineTo(780, 615)
    g.fill()
  }
  g.restore()
  // E003 first aid and F001 extinguisher, with supplementary text below the symbols.
  for (const [i, colour] of ['#177456', '#aa3831'].entries()) {
    const x = 24 + i * 365
    g.fillStyle = '#c8c9bf'
    g.fillRect(x, 621, 333, 282)
    g.fillStyle = colour
    g.fillRect(x + 16, 638, 180, 175)
    g.fillStyle = 'white'
    if (i === 0) {
      g.fillRect(x + 86, 654, 42, 135)
      g.fillRect(x + 40, 700, 133, 42)
    } else {
      g.fillRect(x + 62, 698, 44, 91)
      g.fillRect(x + 74, 674, 15, 32)
      g.fillRect(x + 77, 675, 41, 9)
      g.strokeStyle = 'white'
      g.lineWidth = 7
      g.beginPath()
      g.moveTo(x + 75, 680)
      g.quadraticCurveTo(x + 40, 680, x + 44, 730)
      g.stroke()
      g.beginPath()
      g.moveTo(x + 118, 785)
      g.bezierCurveTo(x + 92, 750, x + 141, 753, x + 129, 707)
      g.bezierCurveTo(x + 166, 742, x + 171, 771, x + 152, 785)
      g.fill()
    }
    g.fillStyle = '#2d3d3c'
    g.font = 'bold 34px sans-serif'
    g.fillText(i === 0 ? 'E003　急救' : 'F001　灭火器', x + 15, 872)
    g.fillRect(x + 284, 739, 11, 52)
    g.fillStyle = '#90948b'
    for (let j = 0; j < 3; j++) g.fillRect(x + 218, 653 + j * 13, 69, 3)
  }
  g.fillStyle = '#e0d6ae'
  g.fillRect(24, 923, 698, 77)
  g.fillStyle = '#2e322f'
  g.font = 'bold 31px monospace'
  const load = id === 'L2' ? '观测床　860 kg' : id === 'L1' ? '吊车额定　3,000 kg' : '货梯额定　3,000 kg'
  g.fillText(id + '　' + load, 42, 974)
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  setSurfaceSampling(texture, maxAnisotropy)
  return texture
}
function cabinetFrame() {
  const m = new ModelBuilder()
  m.box('#545c59', [0, 0, -0.05], [1.76, 2.34, 0.095], 'steel')
  for (const x of [-0.868, 0.868]) m.box('#bbc2b9', [x, 0, 0.008], [0.023, 2.34, 0.03], 'steel')
  for (const y of [-1.158, -0.232, 1.158]) m.box('#909a94', [0, y, 0.008], [1.74, 0.024, 0.03], 'steel')
  for (const x of [-0.174, 0.637]) {
    m.beam([x, -0.52, 0.004], [x, -0.52, 0.066], 0.014, 0.014, '#333d3d')
    m.beam([x, -0.52, 0.066], [x, -0.658, 0.066], 0.014, 0.014, '#333d3d')
    m.beam([x, -0.658, 0.066], [x, -0.658, 0.004], 0.014, 0.014, '#333d3d')
  }
  return m
}

export function FloorSigns({ id }: { id: FloorId }) {
  const gl = useThree((s) => s.gl)
  const tex = useMemo(() => endWall(id, gl.capabilities.getMaxAnisotropy()), [id, gl])
  useLayoutEffect(() => () => tex.dispose(), [tex])
  const r = footprint(FLOORS[id].bounds)
  const cut = useBuildingCut()
  const below = id.startsWith('B')
  return (
    <group
      position={below ? [r.x0 + 0.32, 1.51, -1] : [id === 'L2' ? -10.45 : 5.3, 1.51, r.z0 + 0.46]}
      rotation-y={below ? Math.PI / 2 : 0}
      userData={{ annotation: true }}
    >
      <Model build={cabinetFrame} interior />
      <mesh userData={{ annotation: true }}>
        <planeGeometry args={[1.72, 2.3]} />
        <meshBasicMaterial map={tex} toneMapped={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} clippingPlanes={cut?.planes} />
      </mesh>
    </group>
  )
}
