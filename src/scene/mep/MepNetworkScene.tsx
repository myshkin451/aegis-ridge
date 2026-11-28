import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { crew, responsibilityEdges } from '../../data/crew'
import { useCrewTour } from '../../store/useCrewTour'
import { buildMepNetwork, configuredNetwork } from '../../data/mepNetwork'
import { FLOOR_ORDER } from '../../data/floors'
import { getFloorElevation } from '../../geometry/coords'
import type { TerrainAtlas } from '../../geometry/siteElevations'
import { systems, useShelterStore } from '../../store/useShelterStore'
import type { SurveyRuntime } from '../camera/runtime'
import { useOperationsStore } from '../../store/useOperationsStore'
import { maintenanceOverlay } from './maintenanceOverlay'
import { buildMep } from './buildMep'
import { surveyPicker } from './pickNetwork'
import { reduceMotion } from '../utils/Model'

export function MepNetworkScene({ atlas, rt }: { atlas: TerrainAtlas; rt: SurveyRuntime }) {
  const gl = useThree((s) => s.gl),
    get = useThree((s) => s.get)
  const rooms = useOperationsStore(s => s.rooms)
  const base = useMemo(() => buildMepNetwork(atlas), [atlas])
  const network = useMemo(() => configuredNetwork(base, rooms), [base, rooms])
  const model = useMemo(() => buildMep(base), [base])
  const addition = useMemo(() => {
    if (base === network) return null
    const branch = buildMep({ ...network, edges: network.edges.slice(base.edges.length), nodes: network.nodes.slice(base.nodes.length) }, [])
    // Share the live clipping, routing and display uniforms; each batch keeps its own ID mask and label atlas.
    const shared = ['uPlenum', 'uNight', 'uFloor', 'uLayer', 'uLow', 'uHigh', 'uFlow'] as const
    for (const key of shared) Object.assign(branch.uniforms, { [key]: model.uniforms[key] })
    return branch
  }, [base, network, model])
  const work = useMemo(() => maintenanceOverlay(base, model.uniforms.uLow.value, model.uniforms.uHigh.value), [base, model])
  useLayoutEffect(() => {
    model.root.add(work.mesh)
    return () => { model.root.remove(work.mesh); work.dispose(); model.dispose() }
  }, [model, work])
  useLayoutEffect(() => {
    const canvas = gl.domElement
    work.setNetwork(network)
    if (addition) {
      model.drawing.add(addition.drawing)
      model.physical.add(addition.physical)
    }
    const picking = addition ? { ...model, spans: model.spans.concat(addition.spans), serviceSpans: model.serviceSpans.concat(addition.serviceSpans) } : model
    const pass = surveyPicker(picking, rt, canvas, () => get().camera, get().scene)
    const assignments = new Map(crew.map(member => [member.id, { rooms: member.roomIds, edges: responsibilityEdges(member, network) }]))
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
      model.drawing.visible = !s.routeOverview && s.cameraState !== 'walkthrough'
      model.physical.visible = !s.routeOverview && s.cameraState === 'walkthrough'
      const ops = useOperationsStore.getState()
      const maintenance = ops.report.maintenance
      work.update(maintenance, ops.location, s.floor)
      const traced = model.mark(
        s.waterTrace,
        s.hoveredValve,
        ops.location?.roomId ?? maintenance?.roomId,
        Boolean(maintenance),
        useCrewTour.getState().panel ? assignments.get(useCrewTour.getState().selected ?? '') : undefined,
        network,
      )
      addition?.mark(s.waterTrace, s.hoveredValve, undefined, Boolean(maintenance), useCrewTour.getState().panel ? assignments.get(useCrewTour.getState().selected ?? '') : undefined, network)
      if (s.routeOverview) model.affected.visible = false
      canvas.dataset.routeOverview = String(s.routeOverview)
      canvas.dataset.maintenanceSegments = String(work.mesh.count)
      canvas.dataset.maintenanceRoutes = [
        maintenance?.isolatedEdgeIds.length ?? 0,
        maintenance?.backupEdgeIds.length ?? 0,
        maintenance?.route.length ?? 0,
      ].join('/')
      const available = model.floorChannels.get(u.uFloor.value)
      const applied = model.root.visible && !s.routeOverview
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
    const stopCrew = useCrewTour.subscribe((s, p) => { if (s.panel !== p.panel || s.selected !== p.selected) layers() })
    const stopWork = useOperationsStore.subscribe((s, p) => {
      if (s.report.maintenance !== p.report.maintenance || s.location !== p.location) layers()
    })
    const stop = useShelterStore.subscribe((s, p) => {
      if (
        s.routeOverview !== p.routeOverview ||
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
      stopWork()
      stopCrew()
      pass.dispose()
      if (addition) {
        model.drawing.remove(addition.drawing)
        model.physical.remove(addition.physical)
        addition.root.add(addition.drawing, addition.physical)
        addition.dispose()
      }

    }
  }, [network, model, addition, work, rt, gl, get])
  useFrame(({ camera }, dt) => {
    const s = useShelterStore.getState()
    if (model.root.visible && !s.routeOverview) {
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
