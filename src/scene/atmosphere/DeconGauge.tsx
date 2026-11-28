import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace } from 'three'
import { deconGauge, deconPressure, closureProgress } from '../../data/lockdown'
import { lightingCues } from '../../data/lighting'
import { FLOORS } from '../../data/floors'
import { deconInstrument } from '../../geometry/deconGauge'
import { lockdownElapsed, useOperationsStore } from '../../store/useOperationsStore'
import { useShelterStore } from '../../store/useShelterStore'
import { emergencyCircuit, lobbyCircuit } from '../materials/pbrLibrary'

export function mountGaugeFace(material: ShaderMaterial) {
  const { centre, width, height, yaw } = deconInstrument
  const mesh = new Mesh(new PlaneGeometry(width, height), material)
  mesh.name = 'B1 洗消门 / 压差指示'
  mesh.position.set(centre[0], FLOORS.B1.elevation + centre[1], centre[2])
  mesh.rotation.y = yaw
  return mesh
}
function buildGauge() {
  const canvas = document.createElement('canvas')
  canvas.width = 384
  canvas.height = 400
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#586362'
  ctx.fillRect(0, 0, 384, 400)
  ctx.fillStyle = '#e1e0d1'
  ctx.fillRect(8, 8, 368, 384)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#263536'
  ctx.font = 'bold 27px sans-serif'
  ctx.fillText('DP-101　洗消压差', 192, 43)
  ctx.font = 'bold 23px sans-serif'
  ctx.fillText('洁净走廊 − 洗消室', 192, 78)
  ctx.font = '18px sans-serif'
  ctx.fillText('演示设定　+30 Pa', 192, 106)
  const cx = 192,
    cy = 239
  ctx.lineWidth = 3
  ctx.strokeStyle = '#424d4e'
  ctx.beginPath()
  ctx.arc(cx, cy, 114, -Math.PI * 1.2, Math.PI * 0.2)
  ctx.stroke()
  for (let j = 0; j <= 30; j++) {
    const a = Math.PI * (-1.2 + (1.4 * j) / 30)
    const major = j % 5 === 0
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * 114, cy + Math.sin(a) * 114)
    ctx.lineTo(cx + Math.cos(a) * (major ? 101 : 108), cy + Math.sin(a) * (major ? 101 : 108))
    ctx.stroke()
    if (major) {
      ctx.font = '18px sans-serif'
      ctx.fillText(String(j * 2), cx + Math.cos(a) * 85, cy + Math.sin(a) * 85 + 5)
    }
  }
  ctx.font = '24px sans-serif'
  ctx.fillText('ΔP  /  Pa', cx, cy + 51)
  ctx.fillStyle = '#c1bfae'
  ctx.fillRect(16, 325, 352, 59)
  ctx.fillStyle = '#303b3d'
  ctx.font = '20px sans-serif'
  ctx.fillText('应急照明', cx + 9, 363)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = new ShaderMaterial({
    uniforms: { face: { value: texture }, angle: { value: 0 }, alarm: { value: 0 } },
    vertexShader:
      'varying vec2 st; void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec2 st;
      uniform sampler2D face;
      uniform float angle,alarm;
      void main(){
        vec3 rgb=texture2D(face,st).rgb;
        vec2 xy=vec2(st.x*384., (1.-st.y)*400.);
        vec2 p=xy-vec2(192.,239.);
        vec2 n=vec2(cos(angle),sin(angle));
        float dist=length(p-n*clamp(dot(p,n),-13.,98.));
        float ink=1.-smoothstep(1.4,2.6,dist);
        rgb=mix(rgb,vec3(.35,.022,.008),max(ink,1.-smoothstep(6.,7.,length(p))));
        float lens=1.-smoothstep(12.,14.,length(xy-vec2(83.,354.)));
        rgb=mix(rgb,mix(vec3(.09,.05,.04),vec3(2.1,.085,.025),alarm),lens);
        gl_FragColor=vec4(rgb,1.);
      }`,
  })
  const mesh = mountGaugeFace(material)
  return { mesh, texture }
}
export function DeconGauge() {
  const { mesh, texture } = useMemo(buildGauge, [])
  useLayoutEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      texture.dispose()
    },
    [mesh, texture],
  )
  useFrame(({ camera, gl }) => {
    const view = useShelterStore.getState(),
      op = useOperationsStore.getState()
    const seconds = lockdownElapsed(op)
    const pressure = deconPressure(seconds)
    emergencyCircuit.value = closureProgress(
      seconds,
      lightingCues.interiorEmergency,
      lightingCues.interiorEmergency + 0.35,
    )
    lobbyCircuit.value =
      1 - closureProgress(seconds, lightingCues.publicLobbyOff, lightingCues.publicLobbyOff + 0.4)
    mesh.material.uniforms.angle.value = Math.PI * (-1.2 + (1.4 * pressure) / deconGauge.spanPa)
    mesh.material.uniforms.alarm.value = emergencyCircuit.value
    mesh.visible =
      view.cameraState === 'walkthrough' &&
      view.lastFloor === 'B1' &&
      camera.position.distanceToSquared(mesh.position) < 225
    const d = gl.domElement.dataset
    const pa = pressure.toFixed(1)
    if (d.deconPressurePa !== pa) d.deconPressurePa = pa
    const lighting = emergencyCircuit.value > 0 ? 'emergency' : 'normal'
    if (d.lightingCircuit !== lighting) d.lightingCircuit = lighting
  }, -0.1)
  return <primitive object={mesh} />
}
