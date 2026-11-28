import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function pngURL(path) {
  return 'data:image/png;base64,' + (await readFile(path)).toString('base64')
}

export async function comparePhotographs(page, before, after, excludedRects = []) {
  const urls = await Promise.all([pngURL(before), pngURL(after)])
  return page.evaluate(
    async ({ urls, excludedRects }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1440
      canvas.height = 900
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const pixels = []
      for (const url of urls) {
        const image = new Image()
        image.src = url
        await image.decode()
        if (image.width !== canvas.width || image.height !== canvas.height) throw Error('摄影画幅失配')
        ctx.drawImage(image, 0, 0)
        pixels.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
      }
      let changed = 0,
        total = 0,
        count = 0
      for (let i = 0; i < pixels[0].length; i += 4) {
        const x = (i / 4) % canvas.width,
          y = Math.floor(i / (4 * canvas.width))
        if (
          excludedRects.some((rect) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom)
        )
          continue
        count++
        const r = Math.abs(pixels[0][i] - pixels[1][i])
        const g = Math.abs(pixels[0][i + 1] - pixels[1][i + 1])
        const b = Math.abs(pixels[0][i + 2] - pixels[1][i + 2])
        total += r + g + b
        if (Math.max(r, g, b) >= 5) changed++
      }
      return { mean: +(total / (3 * count)).toFixed(4), changed: +((100 * changed) / count).toFixed(3) }
    },
    { urls, excludedRects },
  )
}

/** Read original lossless frames; only the companion overview is resampled. */
export async function makeContactSheet(page, directory, pilots, destination) {
  const frames = []
  for (const [name] of pilots) {
    for (const stage of ['r0', 'r1', 'r2', 'r3'])
      frames.push(await pngURL(join(directory, stage + '-' + name + '.png')))
  }
  const webp = await page.evaluate(async (frames) => {
    const canvas = document.createElement('canvas')
    const width = 576,
      height = 360,
      gap = 10,
      margin = 32,
      rowHeight = height + 46
    canvas.width = 2 * margin + 4 * width + 3 * gap
    canvas.height = margin + 52 + 3 * rowHeight + margin
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f3efe6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#282a25'
    ctx.font = 'bold 22px system-ui'
    const stages = [
      'r0　原始基线 · ebbe617',
      'r1　程序化材质与陈设',
      'r2　四套实拍表面',
      'r3　软装、洁具与挂画',
    ]
    for (const [i, title] of stages.entries()) ctx.fillText(title, margin + i * (width + gap), margin + 19)
    const rooms = ['单人卧室 1　19:30', '共餐客厅　10:30', '卫浴洗烘　19:30']
    for (const [i, src] of frames.entries()) {
      const row = Math.floor(i / 4),
        col = i % 4
      const y = margin + 52 + row * rowHeight
      if (col === 0) {
        ctx.font = '19px system-ui'
        ctx.fillText(rooms[row], margin, y + 20)
      }
      const image = new Image()
      image.src = src
      await image.decode()
      ctx.drawImage(image, margin + col * (width + gap), y + 32, width, height)
    }
    return canvas.toDataURL('image/webp', 0.93).split(',')[1]
  }, frames)
  await writeFile(destination, Buffer.from(webp, 'base64'))
}
