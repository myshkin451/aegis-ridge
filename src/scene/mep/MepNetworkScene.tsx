import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { buildMepNetwork } from '../../data/mepNetwork'
import { FLOOR_ORDER } from '../../data/floors'
import { getFloorElevation } from '../../geometry/coords'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import { systems, useShelterStore } from '../../store/useShelterStore'
import type { SurveyRuntime } from '../camera/runtime'
import { buildMep } from './buildMep'
import { surveyPicker } from './pickNetwork'
import { reduceMotion } from '../utils/Model'

export function MepNetworkScene({ atlas, rt }: { atlas: TerrainAtlas; rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    get = useThree((s) => s.get)
  const network = useMemo(() => buildMepNetwork(atlas), [atlas])
  const model = useMemo(() => buildMep(network), [network])
  useLayoutEffect(() => {
    const canvas = gl.domElement
    const pass = surveyPicker(model, rt, canvas, () => get().camera, get().scene)
    function layers() {
      const s = useShelterStore.getState(),
        u = model.uniforms
      const external = s.cameraState === 'site' && s.mode !== 'xray'
      model.root.visible = !external
      u.uPlenum.value = Number(s.plenum)
      u.uNight.value = Number(s.mode === 'xray')
      u.uFloor.value = s.floor === 'ALL' ? -1 : FLOOR_ORDER.indexOf(s.floor)
      for (const [i, id] of systems.entries()) u.uLayer.value[i] = Number(s.layers[id])
      u.uLayer.value[6] = u.uLayer.value[2]
      u.uLow.value.setScalar(-25000)
      u.uHigh.value.setScalar(25000)
      if (s.mode !== 'xray') {
        if (s.cameraState === 'sectionBox') {
          const b = s.box
          u.uLow.value.set(b.west, b.bottom, b.north)
          u.uHigh.value.set(b.east, b.top, b.south)
        } else if (s.cameraState === 'section') u.uHigh.value.z = s.sectionZ
        // A plan convention projects this floor's ceiling services above the horizontal cut.
        // A manually peeled orbit still clips the installation at the requested elevation.
        else if (s.cameraState === 'floorOrbit' && s.orbitCut)
          u.uHigh.value.y = getFloorElevation(s.lastFloor) + s.cutHeight
      }
      model.drawing.visible = s.cameraState !== 'walkthrough'
      model.physical.visible = !model.drawing.visible
      const traced = model.mark(s.waterTrace, s.hoveredValve)
      const available = model.floorChannels.get(u.uFloor.value)
      const applied = model.root.visible
        ? systems.filter((id, i) => u.uLayer.value[i] && (!available || available.has(id)))
        : []
      const d = canvas.dataset
      d.mepLayers = applied.join(',')
      d.mepPlenum = u.uPlenum.value ? 'on' : 'off'
      d.mepTraceCount = String(model.root.visible ? traced.count : 0)
      d.mepAffectedRooms = model.root.visible ? traced.rooms.join(',') : ''
      pass.invalidate()
    }
    useShelterStore.getState().setMepNetwork(network)
    layers()
    const stop = useShelterStore.subscribe((s, p) => {
      if (
        s.layers !== p.layers ||
        s.floor !== p.floor ||
        s.cameraState !== p.cameraState ||
        s.mode !== p.mode ||
        s.plenum !== p.plenum ||
        s.box !== p.box ||
        s.orbitCut !== p.orbitCut ||
        s.sectionZ !== p.sectionZ ||
        s.cutHeight !== p.cutHeight ||
        s.waterTrace !== p.waterTrace ||
        s.hoveredValve !== p.hoveredValve
      )
        layers()
    })
    return () => {
      stop()
      pass.dispose()
      model.dispose()
      useShelterStore.getState().setMepNetwork(null)
    }
  }, [network, model, rt, gl, get])
  useFrame(({ camera }, dt) => {
    const s = useShelterStore.getState()
    if (model.root.visible) {
      const near =
        s.cameraState === 'walkthrough' ||
        (s.cameraState === 'floorOrbit' && s.mode !== 'xray' && camera.position.distanceTo(rt.target) < 12)
      model.physical.visible = near
      model.drawing.visible = !near
      model.uniforms.uFlow.value = reduceMotion()
        ? 0
        : (model.uniforms.uFlow.value + Math.min(dt, 0.1) * 1.2) % (Math.PI * 2)
    }
  })
  return <primitive object={model.root} />
}
