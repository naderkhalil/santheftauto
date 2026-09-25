import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createAtmosphere } from './atmosphere';
import { upgradeRoadSurface } from './surfaces';
import type { CourseRoute } from './course-route';

/** The original city's daylight/material pipeline, with this district's own
 * positions for moving shadows and reflections of opposing façades. */
export function createCerebralPresentation(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,route:CourseRoute,low:boolean,prepareReflection?:(point:{x:number;y:number;z:number})=>void){
  scene.background=null;
  renderer.info.autoReset=false;
  renderer.shadowMap.autoUpdate=false;
  let shadowProgress=-Infinity;
  renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.toneMappingExposure=1.04;
  const reflectionPoints=[.03,.44,.72,.95].map(f=>{const p=route.sampleRoute(route.TRACK_LENGTH*f);return {...p,y:p.y+5};});
  const atmosphere=createAtmosphere(renderer,scene,camera,{sampleRoute:route.sampleRoute,reflectionPoints,shadowExtent:100,sunDirection:{x:-.570,y:.682,z:-.461},prepareReflection});
  atmosphere.setQuality(low,true);
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const ao=new GTAOPass(scene,camera,innerWidth,innerHeight);
  ao.enabled=!low;ao.blendIntensity=.65;
  ao.updateGtaoMaterial({radius:1.05,thickness:.65,distanceExponent:1.6,samples:8});
  ao.updatePdMaterial({radius:4,rings:2,samples:8});
  const exclusions:THREE.Object3D[]=[];
  const renderAO=ao.render.bind(ao);
  ao.render=(active,write,read,delta,mask)=>{
    const auto=active.shadowMap.autoUpdate,needs=active.shadowMap.needsUpdate;
    const hidden=exclusions.filter(mesh=>mesh.visible);
    active.shadowMap.autoUpdate=false;active.shadowMap.needsUpdate=false;
    hidden.forEach(mesh=>mesh.visible=false);
    try{renderAO(active,write,read,delta,mask);}finally{hidden.forEach(mesh=>mesh.visible=true);active.shadowMap.autoUpdate=auto;active.shadowMap.needsUpdate=needs;}
  };
  const resizeAO=ao.setSize.bind(ao);ao.setSize=(w,h)=>resizeAO(Math.ceil(w*.65),Math.ceil(h*.65));
  composer.addPass(ao);
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.085,.35,1.65);bloom.enabled=!low;composer.addPass(bloom);
  const smaa=new SMAAPass();composer.addPass(smaa);composer.addPass(new OutputPass());
  return {
    async ready(car:THREE.Object3D){
      await Promise.all([atmosphere.loadPhotographicSky(),upgradeRoadSurface(scene,renderer)]);
      scene.traverse(o=>{if(o.userData.cerebralSkipAO){exclusions.push(o);return;}if(o instanceof THREE.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.every(m=>m.transparent||m.alphaTest>0))exclusions.push(o);}});
      atmosphere.update(0,route.START_PROGRESS);
      renderer.shadowMap.needsUpdate=true;
      atmosphere.bakeCityReflections(car);
      composer.setSize(innerWidth,innerHeight);
    },
    update(time:number,progress:number){atmosphere.update(time,progress);
      if(Math.abs(progress-shadowProgress)>1.25){renderer.shadowMap.needsUpdate=true;shadowProgress=progress;}
    },
    render(){renderer.info.reset();composer.render();},
    resize(){composer.setSize(innerWidth,innerHeight);},
  };
}
