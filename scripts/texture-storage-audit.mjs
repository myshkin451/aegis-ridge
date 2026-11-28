// Pass this closure directly to Playwright page.addInitScript before navigation.
export function installTextureAudit() {
  const kinds = ['texture', 'renderbuffer', 'buffer']
  const stats = Object.fromEntries(kinds.map((k) => [k, { liveBytes: 0, peakBytes: 0, releasedBytes: 0 }]))
  const contexts = new WeakMap(), unknown = new Set()
  let peakBytes = 0, liveBytes = 0
  function account(kind, oldBytes, newBytes) {
    const s = stats[kind]
    s.liveBytes += newBytes - oldBytes
    s.releasedBytes += oldBytes
    s.peakBytes = Math.max(s.peakBytes, s.liveBytes)
    liveBytes += newBytes - oldBytes
    peakBytes = Math.max(peakBytes, liveBytes)
  }
  function context(gl) {
    let s = contexts.get(gl)
    if (s) return s
    const pixelBytes = new Map()
    for (const [bytes, names] of [
      [1, 'R8 R8_SNORM R8I R8UI STENCIL_INDEX8'],
      [2, 'RG8 RG8_SNORM RG8I RG8UI R16F R16I R16UI RGB565 RGBA4 RGB5_A1 DEPTH_COMPONENT16'],
      [3, 'RGB8 SRGB8 RGB8_SNORM RGB8I RGB8UI'],
      [4, 'RGBA8 SRGB8_ALPHA8 RGBA8_SNORM RGBA8I RGBA8UI RG16F RG16I RG16UI R32F R32I R32UI RGB10_A2 RGB10_A2UI R11F_G11F_B10F RGB9_E5 DEPTH_COMPONENT24 DEPTH_COMPONENT32F DEPTH24_STENCIL8'],
      [6, 'RGB16F RGB16I RGB16UI'],
      [8, 'RGBA16F RGBA16I RGBA16UI RG32F RG32I RG32UI DEPTH32F_STENCIL8'],
      [12, 'RGB32F RGB32I RGB32UI'],
      [16, 'RGBA32F RGBA32I RGBA32UI'],
    ]) for (const name of names.split(' ')) if (typeof gl[name] === 'number') pixelBytes.set(gl[name], bytes)
    s = { unit: 0, bindings: new Map(), rb: null, textures: new Map(), renderbuffers: new Map(), pixelBytes,
      buffers: new Map(), boundBuffers: new Map(), vao: null, elementBuffers: new Map() }
    contexts.set(gl, s)
    gl.canvas?.addEventListener('webglcontextlost', () => {
      for (const t of s.textures.values()) for (const level of t.levels.values()) account('texture', level.bytes, 0)
      for (const bytes of s.renderbuffers.values()) account('renderbuffer', bytes, 0)
      for (const bytes of s.buffers.values()) account('buffer', bytes, 0)
      s.textures.clear()
      s.renderbuffers.clear()
      s.bindings.clear()
      s.buffers.clear()
      s.boundBuffers.clear()
      s.elementBuffers.clear()
      s.vao = null
      s.unit = 0
      s.rb = null
    })
    return s
  }
  function bindTarget(gl, target) {
    return target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
      ? gl.TEXTURE_CUBE_MAP : target
  }
  function currentTexture(gl, target) {
    const s = context(gl), t = s.bindings.get(s.unit * 0x10000 + bindTarget(gl, target))
    if (!t) return null
    if (!s.textures.has(t)) s.textures.set(t, { levels: new Map(), immutable: false, base: 0, max: 1000 })
    return s.textures.get(t)
  }
  // Logical internal-format payload. DEPTH_COMPONENT24 is conservatively accounted as D24X8.
  function imageBytes(gl, format, type, w, h, d) {
    const known = context(gl).pixelBytes.get(format)
    if (known) return w * h * d * known
    const blocks8 = [0x83f0, 0x83f1, 0x8c4c, 0x8c4d, 0x8d64, 0x8dbb, 0x8dbc, 0x9270, 0x9271, 0x9274, 0x9275, 0x9276, 0x9277]
    const blocks16 = [0x83f2, 0x83f3, 0x8c4e, 0x8c4f, 0x8dbd, 0x8dbe, 0x8e8c, 0x8e8d, 0x8e8e, 0x8e8f, 0x9272, 0x9273, 0x9278, 0x9279]
    if (blocks8.includes(format) || blocks16.includes(format))
      return Math.ceil(w / 4) * Math.ceil(h / 4) * d * (blocks8.includes(format) ? 8 : 16)
    // Three also creates unsized RGBA one-texel defaults and can upload DOM sources.
    const channels = format === gl.RGBA ? 4 : format === gl.RGB ? 3 :
      format === gl.RG || format === gl.LUMINANCE_ALPHA ? 2 :
      [gl.ALPHA, gl.LUMINANCE, gl.RED, gl.DEPTH_COMPONENT].includes(format) ? 1 : 0
    const packed = [gl.UNSIGNED_SHORT_4_4_4_4, gl.UNSIGNED_SHORT_5_5_5_1, gl.UNSIGNED_SHORT_5_6_5].includes(type) ? 2 :
      [gl.UNSIGNED_INT_2_10_10_10_REV, gl.UNSIGNED_INT_10F_11F_11F_REV, gl.UNSIGNED_INT_5_9_9_9_REV, gl.UNSIGNED_INT_24_8].includes(type) ? 4 : 0
    const element = type === gl.UNSIGNED_BYTE || type === gl.BYTE ? 1 :
      [gl.HALF_FLOAT, gl.UNSIGNED_SHORT, gl.SHORT].includes(type) ? 2 :
      [gl.FLOAT, gl.UNSIGNED_INT, gl.INT].includes(type) ? 4 : 0
    if (packed || (channels && element)) return w * h * d * (packed || channels * element)
    unknown.add('format=0x' + format.toString(16) + '/type=' + (type ?? 'storage'))
    return 0
  }
  function put(gl, t, face, level, format, type, w, h, d) {
    const key = face * 0x100 + level
    const bytes = imageBytes(gl, format, type, w, h, d)
    const prior = t.levels.get(key)
    if (prior && prior.w === w && prior.h === h && prior.d === d &&
        prior.format === format && prior.type === type && prior.bytes === bytes) return
    account('texture', prior?.bytes ?? 0, bytes)
    t.levels.set(key, { format, type, w, h, d, bytes })
  }
  function faces(gl, target) {
    return target === gl.TEXTURE_CUBE_MAP
      ? Array.from({ length: 6 }, (_, i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i)
      : [target]
  }
  function mipChain(gl, t, face, first, last, format, type, w, h, d) {
    const volume = face === gl.TEXTURE_3D
    for (let level = first; level <= last; level++) {
      put(gl, t, face, level, format, type, w, h, d)
      w = Math.max(1, Math.floor(w / 2))
      h = Math.max(1, Math.floor(h / 2))
      if (volume) d = Math.max(1, Math.floor(d / 2))
    }
  }
  const proto = WebGL2RenderingContext.prototype
  function after(name, record) {
    const original = proto[name]
    if (!original) return
    proto[name] = function (...args) {
      const result = original.apply(this, args)
      record(this, ...args)
      return result
    }
  }
  after('activeTexture', (gl, unit) => { context(gl).unit = unit - gl.TEXTURE0 })
  after('bindTexture', (gl, target, t) => {
    const s = context(gl)
    s.bindings.set(s.unit * 0x10000 + target, t)
  })
  after('texParameteri', (gl, target, pname, value) => {
    if (pname !== gl.TEXTURE_BASE_LEVEL && pname !== gl.TEXTURE_MAX_LEVEL) return
    const t = currentTexture(gl, target)
    if (t) t[pname === gl.TEXTURE_BASE_LEVEL ? 'base' : 'max'] = value
  })
  function storage(gl, target, levels, format, w, h, d = 1) {
    const t = currentTexture(gl, target)
    if (!t || t.immutable) return
    for (const face of faces(gl, target)) mipChain(gl, t, face, 0, levels - 1, format, null, w, h, d)
    t.immutable = true
  }
  after('texStorage2D', storage)
  after('texStorage3D', storage)
  function image(gl, target, level, format, type, w, h, d) {
    const t = currentTexture(gl, target)
    if (t && !t.immutable) put(gl, t, target, level, format, type, w, h, d)
  }
  after('texImage2D', (gl, target, level, internal, ...params) => {
    if (params.length === 3) {
      const [, type, source] = params
      const w = source.videoWidth || source.naturalWidth || source.displayWidth || source.width
      const h = source.videoHeight || source.naturalHeight || source.displayHeight || source.height
      image(gl, target, level, internal, type, w, h, 1)
    } else image(gl, target, level, internal, params[4], params[0], params[1], 1)
  })
  after('texImage3D', (gl, target, level, internal, w, h, d, border, format, type) =>
    image(gl, target, level, internal, type, w, h, d))
  after('copyTexImage2D', (gl, target, level, format, x, y, w, h) =>
    image(gl, target, level, format, gl.UNSIGNED_BYTE, w, h, 1))
  after('compressedTexImage2D', (gl, target, level, format, w, h) =>
    image(gl, target, level, format, null, w, h, 1))
  after('compressedTexImage3D', (gl, target, level, format, w, h, d) =>
    image(gl, target, level, format, null, w, h, d))
  after('generateMipmap', (gl, target) => {
    const t = currentTexture(gl, target)
    if (!t || t.immutable) return
    for (const face of faces(gl, target)) {
      const base = t.levels.get(face * 0x100 + t.base)
      if (!base || !base.w || !base.h || !base.d) continue
      const deepest = Math.max(base.w, base.h, target === gl.TEXTURE_3D ? base.d : 1)
      mipChain(gl, t, face, t.base, Math.min(t.max, t.base + Math.floor(Math.log2(deepest))),
        base.format, base.type, base.w, base.h, base.d)
    }
  })
  after('deleteTexture', (gl, texture) => {
    const s = context(gl), t = s.textures.get(texture)
    if (!t) return
    for (const level of t.levels.values()) account('texture', level.bytes, 0)
    s.textures.delete(texture)
    for (const [key, bound] of s.bindings) if (bound === texture) s.bindings.set(key, null)
  })
  after('bindRenderbuffer', (gl, target, rb) => { context(gl).rb = rb })
  function renderbuffer(gl, samples, format, w, h) {
    const s = context(gl)
    if (!s.rb) return
    const n = imageBytes(gl, format, null, w, h, Math.max(1, samples))
    const old = s.renderbuffers.get(s.rb) ?? 0
    if (old === n) return
    account('renderbuffer', old, n)
    s.renderbuffers.set(s.rb, n)
  }
  after('renderbufferStorage', (gl, target, format, w, h) => renderbuffer(gl, 1, format, w, h))
  after('renderbufferStorageMultisample', (gl, target, samples, format, w, h) =>
    renderbuffer(gl, samples, format, w, h))
  after('deleteRenderbuffer', (gl, rb) => {
    const s = context(gl)
    account('renderbuffer', s.renderbuffers.get(rb) ?? 0, 0)
    s.renderbuffers.delete(rb)
    if (s.rb === rb) s.rb = null
  })
  // ELEMENT_ARRAY_BUFFER belongs to the current VAO (including the default VAO).
  // Other bufferData targets use the context's generic binding. Indexed bind calls
  // also update that generic binding, even when only a subrange is indexed.
  after('bindVertexArray', (gl, vao) => { context(gl).vao = vao })
  after('deleteVertexArray', (gl, vao) => {
    if (!vao) return
    const s = context(gl)
    s.elementBuffers.delete(vao)
    if (s.vao === vao) s.vao = null
  })
  after('bindBuffer', (gl, target, buffer) => {
    const s = context(gl)
    if (target === gl.ELEMENT_ARRAY_BUFFER) s.elementBuffers.set(s.vao, buffer)
    else s.boundBuffers.set(target, buffer)
  })
  const bindIndexed = (gl, target, _index, buffer) => { context(gl).boundBuffers.set(target, buffer) }
  after('bindBufferBase', bindIndexed)
  after('bindBufferRange', bindIndexed)
  after('bufferData', (gl, target, source, _usage, offset = 0, length = 0) => {
    const s = context(gl)
    const buffer = target === gl.ELEMENT_ARRAY_BUFFER ? s.elementBuffers.get(s.vao) : s.boundBuffers.get(target)
    if (!buffer || source == null) return
    let bytes
    if (typeof source === 'number') bytes = source
    else {
      // For a typed view, offset and length are in elements, relative to that view.
      // DataView uses bytes. A zero or omitted length uploads the remainder.
      const stride = source.BYTES_PER_ELEMENT ?? 1
      const available = source.byteLength - offset * stride
      bytes = length ? length * stride : available
      if (offset < 0 || bytes > available) return
    }
    if (!Number.isSafeInteger(bytes) || bytes < 0) return
    account('buffer', s.buffers.get(buffer) ?? 0, bytes)
    s.buffers.set(buffer, bytes)
  })
  // bufferSubData and copyBufferSubData modify contents without replacing storage.
  after('deleteBuffer', (gl, buffer) => {
    if (!buffer) return
    const s = context(gl)
    account('buffer', s.buffers.get(buffer) ?? 0, 0)
    s.buffers.delete(buffer)
    for (const [target, bound] of s.boundBuffers) if (bound === buffer) s.boundBuffers.delete(target)
    for (const [vao, bound] of s.elementBuffers) if (bound === buffer) s.elementBuffers.delete(vao)
  })
  window.arsTextureAudit = () => ({
    ...Object.fromEntries(kinds.map((k) => [k, { ...stats[k] }])),
    peakBytes,
    liveBytes,
    unknownFormats: [...unknown],
  })
}
