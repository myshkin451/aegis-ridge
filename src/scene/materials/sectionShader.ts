import { DoubleSide, ShaderMaterial } from 'three'

export type CutMaterial = 'structure' | 'concrete' | 'granite'
export function sectionMaterial(kind: CutMaterial | 'soil') {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: { lithology: { value: ['soil', 'granite', 'concrete', 'structure'].indexOf(kind) } },
    vertexShader: `
      #include <clipping_planes_pars_vertex>
      attribute float groundY;
      varying vec3 vWorld;
      varying float vSurface;
      void main(){
        vec4 world=modelMatrix*vec4(position,1.);
        vWorld=world.xyz; vSurface=groundY;
        vec4 mvPosition=viewMatrix*world;
        gl_Position=projectionMatrix*mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform int lithology;
      varying vec3 vWorld;
      varying float vSurface;
      float mark(float d){return 1.-smoothstep(0., max(fwidth(d),0.021),d);}
      float rule(float d,float pixels){return 1.-smoothstep(pixels-.5,pixels+.5,abs(d)/max(fwidth(d),.0001));}
      float hatch(float u,float period){return abs(fract(u/period+.5)-.5)*period;}
      void main(){
        #include <clipping_planes_fragment>
        vec3 n=abs(cross(dFdx(vWorld),dFdy(vWorld)));
        vec2 p=n.y>max(n.x,n.z)?vWorld.xz:(n.x>n.z?vWorld.zy:vWorld.xy);
        float depth=vSurface-p.y;
        vec2 g=mod(p+vec2(.3,.4),1.36)-.68;
        float plus=mark(min(max(abs(g.x)-.023,abs(g.y)-.16),max(abs(g.y)-.023,abs(g.x)-.16)));
        vec3 base=vec3(.66,.62,.58), ink=vec3(.30,.29,.28);
        float joints=0.;
        for(int i=0;i<3;i++){
          float slope=i==0?2.6:(i==1?-1.9:.25);
          float seam=p.y-p.x*slope+.08*sin(p.x*1.7)+.24*sin(p.y*.64);
          joints+=mark(hatch(seam, i==2?9.:15.)-.021)*.61;
        }
        float vein=1.-smoothstep(.045,.17,abs(p.y+.46*p.x+7.+.6*sin(p.x*.42)));
        vec3 color=mix(mix(base,ink,min(.82,.66*plus+joints)),vec3(.87,.84,.77),vein);
        if(lithology==0 && depth<2.8+.38*sin(p.x*.49)) {
          vec2 dots=mod(p,vec2(.77,.61))-vec2(.385,.305);
          color=mix(vec3(.71,.66,.55),ink,.52*max(plus,mark(length(dots)-.036)));
        }
        if(lithology==0 && depth<.65+.16*sin(p.x*1.17)) {
          color=mix(vec3(.52,.44,.32),ink,.72*mark(hatch(p.y-p.x,.46)-.025)*step(.1,fract(p.x*.98)));
        }
        if(lithology==2) {
          vec2 c=mod(p,1.12)-.56;
          float tri=abs(max(abs(c.x)*.866+c.y*.5,-c.y)-.085);
          color=mix(vec3(.76,.76,.71),ink,.67*max(mark(tri-.014),mark(hatch(p.x-p.y,.47)-.016)));
        }
        if(lithology==3) color=vec3(.009,.011,.012);
        if(lithology==0) {
          float level=-18.7+.050*p.x+.37*sin(p.x*.12), y=p.y-level;
          float dash=mark(abs(y)-.045)*step(.26,fract(p.x*.48));
          vec2 w=vec2(mod(p.x+2.,7.)-3.5,y);
          float head=abs(max(abs(w.x)*.86-w.y*.5,w.y)-.22);
          color=mix(color,vec3(.12,.40,.64),max(dash,mark(head-.035)));
          color=mix(color,ink,rule(depth,2.));
        }
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  })
}
