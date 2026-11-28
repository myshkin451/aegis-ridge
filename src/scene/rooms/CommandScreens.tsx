import { useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three'
import { roomsOn } from '../../data/defaultBlueprint'
import { scenarioNames, useOperationsStore, type Diagnostic } from '../../store/useOperationsStore'
import { useBuildingCut } from '../BuildingSection'
import { commandPanels } from './commandConsoleGeometry'

const width = 272,
  height = 180,
  cols = 4
const desk = roomsOn('B2')
  .find((room) => room.id === 'b2_command')!
  .equipment.find((unit) => unit.tagCode === 'HMI-201')!

function screens() {
  const positions: number[] = [],
    uvs: number[] = []
  for (const [i, panel] of commandPanels.entries()) {
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ]) {
      positions.push(...panel.position((u - 0.5) * 0.782, 1.6 + (v - 0.5) * 0.6, -0.202))
      uvs.push(((i % cols) + u) / cols, 1 - (Math.floor(i / cols) + 1 - v) / 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  const canvas = document.createElement('canvas')
  canvas.width = cols * width
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  const material = new MeshBasicMaterial({ map: texture, toneMapped: false })
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...desk.position)
  mesh.name = 'HMI-201 · 七屏实时工程校核'

  function line(text: string, x: number, y: number, size: number, color: string, bold = false) {
    ctx.fillStyle = color
    ctx.font = (bold ? '600 ' : '') + size + 'px system-ui, sans-serif'
    ctx.fillText(text, x, y, width - 28)
  }
  function paintPanel(i: number, heading: string, reading: string, status: string, footer: string) {
    const x = (i % cols) * width,
      y = Math.floor(i / cols) * height
    ctx.fillStyle = '#1d3538'
    ctx.fillRect(x, y, width, height)
    const ink = status === 'FAIL' ? '#f6a18b' : status === 'WARN' ? '#f2c591' : '#a4d2c1'
    line('ARS-01   /   ' + heading, x + 14, y + 30, 20, '#cfdfdc', true)
    ctx.fillStyle = '#628080'
    ctx.fillRect(x + 14, y + 43, width - 28, 2)
    line(reading, x + 14, y + 97, 39, '#f3f4e6', true)
    line(status, x + 14, y + 133, 22, ink, true)
    line(footer, x + 14, y + 161, 17, '#a9c6c6')
  }
  function redraw(state: ReturnType<typeof useOperationsStore.getState>, all: boolean) {
    const { report, scenario, people, lockdownSeconds, lockdownStartedAt } = state
    const failures = report.rows.filter((row) => row.status === 'FAIL').length
    const warnings = report.rows.filter((row) => row.status === 'WARN').length
    paintPanel(
      3,
      '值班总览',
      scenarioNames[scenario],
      people + ' 人  ·  ' + failures + ' FAIL  ' + warnings + ' WARN',
      lockdownSeconds === 30
        ? '封锁 · 第 1 天'
        : lockdownStartedAt === null
          ? '常规运行'
          : '封锁编排　' + lockdownSeconds + ' / 30 s',
    )
    if (all) {
      const panels = ['power', 'heat', 'water', '', 'oxygen', 'calories', 'filters']
      panels.forEach((id, i) => {
        if (!id) return
        const row: Diagnostic | undefined = report.rows.find((r) => r.id === id)
        if (row) paintPanel(i, row.label, row.value, row.status, row.equipmentTag ?? row.roomId)
        else paintPanel(i, '未收录', '—', '', id)
      })
    }
    texture.needsUpdate = true
    return [scenario, people, lockdownSeconds, failures, warnings].join('/')
  }
  return { mesh, texture, redraw }
}

export function CommandScreens() {
  const model = useMemo(screens, [])
  const cut = useBuildingCut()
  const canvas = useThree((s) => s.gl.domElement)
  useLayoutEffect(() => {
    model.mesh.material.clippingPlanes = cut?.planes ?? null
    canvas.dataset.commandScreen = model.redraw(useOperationsStore.getState(), true)
    const unsubscribe = useOperationsStore.subscribe((s, previous) => {
      const all = s.report !== previous.report
      if (
        all ||
        previous.lockdownSeconds !== s.lockdownSeconds ||
        previous.lockdownStartedAt !== s.lockdownStartedAt
      )
        canvas.dataset.commandScreen = model.redraw(s, all)
    })
    return () => {
      unsubscribe()
      delete canvas.dataset.commandScreen
      model.texture.dispose()
      model.mesh.material.dispose()
      model.mesh.geometry.dispose()
    }
  }, [canvas, model, cut])
  return <primitive object={model.mesh} />
}
