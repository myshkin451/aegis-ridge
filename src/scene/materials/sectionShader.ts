import { DoubleSide, ShaderMaterial } from 'three'

import { terrainV2 } from '../terrain/terrainVersion'

const water = { datum: -18.7, gradient: .05, amplitude: .37, frequency: .12 }
export const groundwaterAt = (x: number) =>
  water.datum + water.gradient * x + water.amplitude * Math.sin(x * water.frequency)

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
    fragmentShader: terrainV2 ? engravedSection : `
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

// Signed distances in survey metres keep each symbol registered to its bed.
// Width derivatives give fine strokes a stable footprint at the drawing scale.
const engravedSection = `
  #include <clipping_planes_pars_fragment>
  uniform int lithology;
  varying vec3 vWorld;
  varying float vSurface;
  float stroke(float d,float width){
    float aa=max(fwidth(d)*.5,.004);
    return 1.-smoothstep(width-aa,width+aa,abs(d));
  }
  float periodic(float v,float period){return (fract(v/period+.5)-.5)*period;}
  float seed(vec2 p){return fract(sin(dot(p,vec2(24.23,53.41)))*1528.341);}
  float segment(vec2 p,vec2 a,vec2 b){
    vec2 axis=b-a;
    return length(p-a-axis*clamp(dot(p-a,axis)/dot(axis,axis),0.,1.));
  }
  float contact(float distance){
    return 1.-smoothstep(.015,.015+max(fwidth(distance),.015),abs(distance));
  }
  void main(){
    #include <clipping_planes_fragment>
    vec3 n=abs(cross(dFdx(vWorld),dFdy(vWorld)));
    vec2 p=n.y>max(n.x,n.z)?vWorld.xz:(n.x>n.z?vWorld.zy:vWorld.xy);
    float depth=vSurface-vWorld.y;
    float bedA=.69+.13*sin(p.x*1.17)+.07*sin(p.x*.44);
    float bedB=2.98+.46*sin(p.x*.49)+.20*sin(.86*p.x+.2);
    vec3 ink=vec3(.076,.093,.109);
    vec3 wash=vec3(.32,.39,.43);
    float pattern=0.;
    if(lithology==3){
      wash=vec3(.005,.007,.009);
    }else if(lithology==2){
      wash=vec3(.56,.52,.42);
      float diagonal=stroke(periodic(p.x-p.y,.59),.021);
      vec2 c=mod(p+vec2(floor(p.y/.72)*.43,0.),vec2(1.08,.72))-vec2(.54,.36);
      float stone=min(segment(c,vec2(-.14,-.09),vec2(.12,-.06)),
                      min(segment(c,vec2(.12,-.06),vec2(.045,.13)),segment(c,vec2(.045,.13),vec2(-.14,-.09))));
      pattern=.70*max(stroke(stone,.027),diagonal*.70);
    }else if(lithology==0 && depth<bedA){
      wash=vec3(.29,.21,.145);
      vec2 c=mod(p+vec2(floor(p.y/.41)*.29,0.),vec2(.56,.41))-vec2(.28,.205);
      pattern=.82*stroke(segment(c,vec2(-.12,-.115),vec2(.12,.10)),.026);
    }else{
      bool weathered=lithology==0 && depth<bedB;
      vec2 grid=vec2(1.54,1.35);
      vec2 q=p+vec2(mod(floor(p.y/grid.y),2.)*.72,0.);
      vec2 cell=floor(q/grid);
      vec2 g=mod(q,grid)-grid*.5;
      g-=vec2(seed(cell)-.5,seed(cell.yx+7.)-.5)*.23;
      float crosses=min(segment(g,vec2(-.15,0.),vec2(.15,0.)),segment(g,vec2(0.,-.15),vec2(0.,.15)));
      float dots=stroke(length(g-vec2(.41,.30)),.043);
      if(weathered){
        wash=mix(vec3(.50,.40,.29),vec3(.57,.48,.36),.5+.5*sin(p.x*.52+p.y*.4));
        pattern=.59*max(dots,stroke(crosses,.026));
      }else{
        // Two steep joint families and a shallow, intermittent release set.
        float broken=.72+.28*smoothstep(-.4,.30,sin(p.y*.83+p.x*.57));
        float fault=stroke(periodic(.93*p.x-.37*p.y+.15*sin(.77*p.y),9.1),.033);
        fault=max(fault,.75*stroke(periodic(.90*p.x+.43*p.y+.18*sin(.55*p.y),12.7),.028));
        fault=max(fault,.66*stroke(periodic(.96*p.y-.27*p.x+.16*sin(.61*p.x),8.8),.030));
        float vein=p.y+.43*p.x+7.4+.65*sin(p.x*.43)+.11*sin(p.x*1.95);
        wash=mix(wash,vec3(.68,.66,.56),.76*(1.-smoothstep(.065,.18,abs(vein))));
        pattern=max(.38*stroke(crosses,.025),.65*fault*broken);
      }
    }
    vec3 color=mix(wash,ink,pattern);
    if(lithology==0){
      color=mix(color,ink,.66*max(contact(depth-bedA),contact(depth-bedB)));
      float d=p.y-(${water.datum}+${water.gradient}*p.x+${water.amplitude}*sin(p.x*${water.frequency}));
      float dash=(1.-smoothstep(.69,.77,abs(periodic(p.x,2.05))))*stroke(d,.053);
      vec2 w=vec2(periodic(p.x-1.,8.2),d);
      float marker=min(segment(w,vec2(-.27,.43),vec2(.27,.43)),min(segment(w,vec2(.27,.43),vec2(0.,0.)),segment(w,vec2(0.,0.),vec2(-.27,.43))));
      color=mix(color,vec3(.021,.21,.32),max(dash,stroke(marker,.040)));
      color=mix(color,ink,1.-smoothstep(.55,1.55,abs(depth)/max(fwidth(depth),.001)));
    }
    gl_FragColor=vec4(color,1.);
    #include <colorspace_fragment>
  }`
