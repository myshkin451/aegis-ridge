import {
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'

// One typeset sheet for identification plates, valve tags and slope annotations.
export function makePlates(strings: string[]) {
  const labels = [...new Set(strings)],
    columns = 4,
    rows = Math.max(1, Math.ceil(labels.length / columns))
  const sheet = document.createElement('canvas')
  sheet.width = columns * 256
  sheet.height = rows * 56
  const ctx = sheet.getContext('2d')!
  const index = new Map<string, number>()
  labels.forEach((label, i) => {
    index.set(label, i)
    const x = (i % columns) * 256,
      y = Math.floor(i / columns) * 56
    ctx.fillStyle = '#e6e5d7'
    ctx.fillRect(x, y, 256, 56)
    ctx.strokeStyle = '#434741'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 3, y + 3, 250, 50)
    ctx.fillStyle = '#1e2422'
    ctx.font = 'bold 30px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + 128, y + 28, 240)
  })
  const texture = new CanvasTexture(sheet)
  texture.anisotropy = 4
  return { texture, index, grid: new Vector2(columns, rows) }
}

const day = ['#CF6A16', '#17899C', '#2B7BBB', '#27885D', '#B8940C', '#B3372A', '#75579E']
const night = ['#F08A35', '#3FB6C9', '#5BA6E3', '#4CB886', '#E2BF3C', '#E35B4C', '#A487D0']
export function makeMepMaterial(count: number, plates: ReturnType<typeof makePlates>) {
  // Rows keep the mask within the WebGL2 minimum guaranteed maximum texture width.
  const width = Math.min(1024, count),
    height = Math.ceil(count / width)
  const mask = new Uint8Array(width * height * 4)
  const texture = new DataTexture(mask, width, height, RGBAFormat)
  texture.minFilter = texture.magFilter = NearestFilter
  texture.needsUpdate = true
  const uniforms = {
    uMask: { value: texture },
    uMaskGrid: { value: new Vector2(width, height) },
    uPlates: { value: plates.texture },
    uGrid: { value: plates.grid },
    uDay: { value: day.map((s) => new Color(s)) },
    uNightInk: { value: night.map((s) => new Color(s)) },
    uLayer: { value: new Float32Array(7).fill(1) },
    uNight: { value: 0 },
    uFlow: { value: 0 },
    uPlenum: { value: 1 },
    uFloor: { value: -1 },
    uTrace: { value: 0 },
    uLow: { value: new Vector3(-25000, -25000, -25000) },
    uHigh: { value: new Vector3(25000, 25000, 25000) },
  }
  const material = new ShaderMaterial({
    uniforms,
    side: DoubleSide,
    vertexShader: `
      attribute vec4 aMeta, aPath;
      varying vec4 vMeta, vPath;
      varying vec3 vInk, vWorld, vNormal;
      varying vec2 vUv;
      varying float vMarked;
      uniform sampler2D uMask;
      uniform vec2 uMaskGrid;
      uniform float uLayer[7], uFloor, uNight, uPlenum;
      uniform vec3 uDay[7], uNightInk[7];
      void main(){
        int ink = int(aMeta.x + .5);
        vMeta = aMeta;
        // Path phase is measured in metres and continues across fittings and elbows.
        vPath = vec4(aPath.x + (position.y + .5) * aPath.y, aPath.yz, mod(aPath.w,8.));
        vUv = uv;
        vWorld = (modelMatrix * instanceMatrix * vec4(position, 1.)).xyz;
        // Grade notes read upright in both elevations and overhead plans.
        if(aMeta.w == 3. && vPath.w == 5.) {
          vec3 right = vec3(viewMatrix[0].x,viewMatrix[1].x,viewMatrix[2].x);
          vec3 up = vec3(viewMatrix[0].y,viewMatrix[1].y,viewMatrix[2].y);
          vWorld = (modelMatrix * instanceMatrix[3]).xyz + right * position.x * length(instanceMatrix[0].xyz)
            + up * position.y * length(instanceMatrix[1].xyz);
        }
        vNormal = normalize(mat3(instanceMatrix) * normal);
        vec2 lookup = vec2(mod(aMeta.z, uMaskGrid.x), floor(aMeta.z / uMaskGrid.x));
        vMarked = texture2D(uMask, (lookup + .5) / uMaskGrid).r;
        vInk = aMeta.w < .5 ? mix(uDay[ink], uNightInk[ink], uNight) : instanceColor;
        if((uLayer[ink] < .5 && aMeta.w < 3.5) || (aPath.w >= 8. && uPlenum < .5) || (uFloor >= 0. && abs(uFloor - aMeta.y) > .1) || (aMeta.w > 3.5 && vMarked < .5)) {
          gl_Position = vec4(2., 2., 2., 1.);
        } else gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.);
      }`,
    fragmentShader: `
      varying vec4 vMeta, vPath;
      varying vec3 vInk, vWorld, vNormal;
      varying vec2 vUv;
      varying float vMarked;
      uniform vec3 uLow, uHigh;
      uniform float uFlow, uNight, uTrace;
      uniform sampler2D uPlates;
      uniform vec2 uGrid;
      void main(){
        if(any(lessThan(vWorld, uLow)) || any(greaterThan(vWorld, uHigh))) discard;
        float style = vMeta.w;
        vec3 ink = vInk;
        if(style < .5){
          float phase = vPath.x;
          float pattern = vPath.w;
          if(pattern == 1. && mod(phase, .59) > .36) discard;
          if(pattern == 2. && mod(phase, 1.85) > 1.28) discard;
          float rail = mod(phase, 1.58);
          if(pattern == 3. && (rail > 1.39 || (rail > .99 && rail < 1.25))) discard;
          if(pattern == 4. && fract(phase * 3.6 + vUv.x * .45) > .49) discard;
          float flow = pow(.5 + .5*cos(phase * 1.65 - uFlow), 10.);
          // The surrounding non-emissive shell supplies context; give hatching a lower ink weight.
          float nightGain = pattern == 4. ? .57 : 1.13;
          ink *= mix(1.30, nightGain, uNight) * (1. + .14 * flow);
        } else if(style < 2.5){
          vec3 n = normalize(vNormal);
          vec3 view = normalize(cameraPosition - vWorld);
          float light = .48 + .40*max(0.,dot(n,normalize(vec3(-.3,.6,.7)))) + .20*abs(n.z);
          ink = ink * light + .09 * pow(max(0.,dot(reflect(-view, n),normalize(vec3(-.4,.7,.4)))), 16.);
        } else if(style < 3.5){
          float cellId = vPath.z;
          // Print the opposite arrow on the reverse face, preserving physical flow direction.
          if(!gl_FrontFacing && vPath.w == 1.) cellId += 1.;
          if(!gl_FrontFacing && vPath.w == 2.) cellId -= 1.;
          vec2 cell = vec2(mod(cellId, uGrid.x), floor(cellId / uGrid.x));
          vec2 uv = vec2(gl_FrontFacing ? vUv.x : 1.-vUv.x, vUv.y);
          vec2 atlas = vec2((cell.x + mix(.014,.986,uv.x))/uGrid.x, 1. - (cell.y + mix(.96,.04,uv.y))/uGrid.y);
          ink = pow(texture2D(uPlates,atlas).rgb,vec3(2.2));
        } else ink = vec3(2.6,.12,.06);
        if(uTrace > .5 && style < 3.5) {
          if(vMarked > .5) ink = ink*2.1 + vec3(.18,.38,.50);
          else ink *= .30;
        }
        gl_FragColor = vec4(ink,1.);
      }`,
  })
  return { uniforms, material, mask, texture }
}
