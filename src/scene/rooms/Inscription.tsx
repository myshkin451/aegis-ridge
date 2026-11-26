import { useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

export function Inscription({
  text,
  position,
  width,
  height,
  color = '#eeeae1',
  background = '#343c3c',
  reverse = false,
  flat = false,
}: {
  text: string
  position: [number, number, number]
  width: number
  height: number
  color?: string
  background?: string
  reverse?: boolean
  flat?: boolean
}) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 768
    c.height = Math.max(64, Math.round((c.width * height) / width))
    const ctx = c.getContext('2d')!
    ctx.fillStyle = background
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = color
    ctx.font = '600 ' + Math.round(c.height * 0.76) + 'px "Arial Narrow","PingFang SC",sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, c.width / 2, c.height * 0.53, c.width * 0.95)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [text, width, height, color, background])
  useLayoutEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh
      position={position}
      rotation-y={reverse ? Math.PI : 0}
      rotation-x={flat ? -Math.PI / 2 : 0}
      userData={{ annotation: true }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
