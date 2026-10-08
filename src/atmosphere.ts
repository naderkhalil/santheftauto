import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { sampleRoute } from './route';
import { cityToRender } from './coordinates';

/** Clear Pacific afternoon: blue skylight, warm raking sun and distant coastal air. */
export function createAtmosphere(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, options: {
  sampleRoute?: typeof sampleRoute;
  reflectionPoints?: readonly {x:number;y:number;z:number}[];
  shadowExtent?: number;
  sunDirection?: {x:number;y:number;z:number};
  prepareReflection?: (point: {x:number;y:number;z:number}) => void;
} = {}) {
  const courseSample=options.sampleRoute??sampleRoute;
  scene.fog = new THREE.FogExp2('#8ccbea', .00056);
  const sunlightDirection = options.sunDirection ? new THREE.Vector3(options.sunDirection.x,options.sunDirection.y,options.sunDirection.z).normalize() : new THREE.Vector3(.570,.682,-.461).normalize();
  const photographRotation=-1.31+Math.atan2(sunlightDirection.z,sunlightDirection.x)-Math.atan2(-.461,.570);
  const renderSunlightDirection = cityToRender(sunlightDirection);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { photographRotation: {value:photographRotation}, time: { value: 0 }, sunDirection: { value: sunlightDirection }, photographicSky: { value: null }, usePhotographicSky: { value: 0 } },
    vertexShader: `varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 vDirection; uniform float time; uniform vec3 sunDirection;
      uniform sampler2D photographicSky; uniform float usePhotographicSky; uniform float photographRotation;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*noise(p);p=r*p*2.03+19.1;a*=.49;}return v;}
      void main(){
        vec3 d=normalize(vDirection);float h=max(d.y,0.);
        if(usePhotographicSky>.5){
          // Match the measured photographic sun to the directional light.
          float a=photographRotation;vec3 q=vec3(cos(a)*d.x+sin(a)*d.z,d.y,-sin(a)*d.x+cos(a)*d.z);
          vec2 uv=vec2(atan(q.z,q.x)/6.28318530718+.5,asin(clamp(q.y,-1.,1.))/3.14159265359+.5);
          vec3 c=texture2D(photographicSky,uv).rgb*1.65*vec3(.80,1.02,1.12);
          float l=dot(c,vec3(.2126,.7152,.0722));
          c=max(vec3(0.),mix(vec3(l),c,mix(1.42,1.,smoothstep(.5,3.,l))));
          gl_FragColor=vec4(min(c,vec3(22.)),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }
        float sunSide=pow(max(dot(normalize(d.xz),normalize(sunDirection.xz)),0.),8.);
        vec3 zenith=vec3(.008,.135,.55);
        vec3 horizon=mix(vec3(.29,.68,.92),vec3(.78,.72,.48),sunSide*.24);
        vec3 color=mix(horizon,zenith,pow(smoothstep(0.,.92,h),.39));
        float towardSun=max(dot(d,sunDirection),0.);
        color+=vec3(1.,.68,.29)*pow(towardSun,24.)*.18;
        color+=vec3(4.,3.2,1.9)*smoothstep(.99960,.99984,towardSun);
        if(d.y>0.){
          vec2 p=d.xz/(h+.15)*2.6+vec2(time*.0013,0.);
          float f=fbm(p+vec2(fbm(p*.60),fbm(p*.60+17.))*.55);
          float cloud=smoothstep(.565,.735,f)*smoothstep(.025,.10,h);
          vec3 cloudColor=mix(vec3(.61,.76,.84),vec3(1.26,1.23,1.08),smoothstep(.55,.71,f));
          color=mix(color,cloudColor,cloud*.94);
          // Fine high cirrus rather than a gray veil over the whole scene.
          float cirrus=fbm(p*vec2(.9,5.)+61.);
          color=mix(color,vec3(.82,.92,1.),smoothstep(.67,.80,cirrus)*.20*smoothstep(.15,.40,h));
        }else color=mix(horizon,vec3(.15,.32,.40),smoothstep(0.,.20,-d.y));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(3500,32,20),skyMaterial);
  // Keep the existing photographic/procedural sky direction in city space,
  // but reflect its sphere just like the city. This also applies to the PMREM
  // clone, so the visible sun, directional light and reflections still agree.
  sky.scale.z=-1;
  sky.name='Pacific blue sky';sky.renderOrder=-1000;sky.frustumCulled=false;scene.add(sky);
  const hemisphere=new THREE.HemisphereLight('#84bcff','#e9bd92',.82);scene.add(hemisphere);
  const sun=new THREE.DirectionalLight('#fff0cb',3.6);sun.castShadow=true;
  sun.shadow.mapSize.set(4096,4096);
  sun.shadow.camera.left=-61;sun.shadow.camera.right=61;sun.shadow.camera.top=78;sun.shadow.camera.bottom=-56;
  sun.shadow.camera.near=1;sun.shadow.camera.far=620;sun.shadow.normalBias=.035;sun.shadow.bias=-.00012;sun.shadow.radius=1.8;
  scene.add(sun,sun.target);
  const coolFill=new THREE.DirectionalLight('#90c9ff',.32);cityToRender({x:-100,y:130,z:-120},coolFill.position);scene.add(coolFill);

  const pmrem=new THREE.PMREMGenerator(renderer);
  const environmentScene=new THREE.Scene();
  const environmentSky=sky.clone();environmentSky.material=skyMaterial;environmentSky.position.set(0,0,0);environmentScene.add(environmentSky);
  let skyEnvironment=pmrem.fromScene(environmentScene,.015,.1,4000);
  scene.environment=skyEnvironment.texture;scene.environmentIntensity=.65;
  const cityEnvironments:THREE.WebGLRenderTarget[]=[];
  let environmentRegion=-1;
  let shadowExtent=0;
  const captureTarget=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
  const captureCamera=new THREE.CubeCamera(.3,1800,captureTarget);scene.add(captureCamera);
  let captured=false;let disposed=false;
  async function loadPhotographicSky(){
    try{
      const photograph=await new HDRLoader().setDataType(THREE.HalfFloatType).loadAsync('/assets/sky/kloofendal_43d_clear_puresky_2k.hdr');
      if(disposed){photograph.dispose();return;}
      photograph.wrapS=THREE.RepeatWrapping;
      skyMaterial.uniforms.photographicSky.value=photograph;
      skyMaterial.uniforms.usePhotographicSky.value=1;
      skyEnvironment.dispose();skyEnvironment=pmrem.fromScene(environmentScene,.015,.1,4000);
      scene.environment=skyEnvironment.texture;
    }catch(error){console.warn('Photographic sky unavailable; using the procedural Pacific sky.',error);}
  }
  function bakeCityReflections(exclude?:THREE.Object3D){
    const previousPosition=sky.position.clone();sky.position.set(0,0,0);
    const visible=exclude?.visible;if(exclude)exclude.visible=false;
    for(const environment of cityEnvironments)environment.dispose();cityEnvironments.length=0;
    // Capture actual opposing architecture at three distinct locations. The
    // Westin's glass reflects the square, rather than an unrelated uphill block.
    const viewpoints=options.reflectionPoints?.map(p=>new THREE.Vector3(p.x,p.y,p.z))??[new THREE.Vector3(-61,29,0),new THREE.Vector3(175,84,400),new THREE.Vector3(660,11,250)];
    for(const viewpoint of viewpoints){
      if(options.prepareReflection){
        options.prepareReflection(viewpoint);
        cityToRender({x:viewpoint.x,y:viewpoint.y+15,z:viewpoint.z},sun.target.position);
        sun.position.copy(sun.target.position).addScaledVector(renderSunlightDirection,300);
        renderer.shadowMap.needsUpdate=true;
      }
      scene.environment=skyEnvironment.texture;cityToRender(viewpoint,captureCamera.position);
      captureCamera.update(renderer,scene);cityEnvironments.push(pmrem.fromCubemap(captureTarget.texture));
    }
    const seen=new Set<THREE.Material>();
    scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object===exclude||object.parent===exclude)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){
        if(!(material instanceof THREE.MeshStandardMaterial)||seen.has(material))continue;
        seen.add(material);
        if(/^Waterfront \//i.test(material.name))material.envMap=cityEnvironments[2].texture;
        else if(/westin|Union Square|Dewey|date.palm/i.test(material.name))material.envMap=cityEnvironments[0].texture;
        else if(/Chinatown/i.test(material.name))material.envMap=cityEnvironments[1].texture;
        material.needsUpdate=true;
      }
    });
    if(exclude)exclude.visible=visible!;sky.position.copy(previousPosition);
    scene.environment=cityEnvironments[0].texture;scene.environmentIntensity=.58;environmentRegion=0;captured=true;
  }
  return {
    dispose(){disposed=true;sky.geometry.dispose();skyMaterial.uniforms.photographicSky.value?.dispose();skyMaterial.dispose();skyEnvironment.dispose();cityEnvironments.forEach(t=>t.dispose());captureTarget.dispose();pmrem.dispose();sun.shadow.map?.dispose();},
    loadPhotographicSky,
    bakeCityReflections,
    update(time:number,progress:number){
      sky.position.copy(camera.position);skyMaterial.uniforms.time.value=time;
      const p=courseSample(progress);
      const inSquare=!options.sampleRoute&&p.x<90&&p.x>-180&&p.z<100&&p.z>-100;
      const extent=options.shadowExtent??(inSquare?146:74);
      if(extent!==shadowExtent){
        shadowExtent=extent;sun.shadow.camera.left=-extent;sun.shadow.camera.right=extent;
        sun.shadow.camera.top=extent;sun.shadow.camera.bottom=-extent;
        sun.shadow.camera.updateProjectionMatrix();
      }
      const target=inSquare?new THREE.Vector3(-12,48,0):new THREE.Vector3(p.x,p.y+20,p.z);
      // Stabilize the moving map to its texel grid to keep fine cornices calm.
      const texel=2*extent/sun.shadow.mapSize.x;
      target.x=Math.round(target.x/texel)*texel;target.z=Math.round(target.z/texel)*texel;
      cityToRender(target,sun.target.position);sun.position.copy(sun.target.position).addScaledVector(renderSunlightDirection,300);
      const region=options.reflectionPoints?options.reflectionPoints.reduce((best,q,index)=>Math.hypot(q.x-p.x,q.z-p.z)<Math.hypot(options.reflectionPoints![best].x-p.x,options.reflectionPoints![best].z-p.z)?index:best,0):p.x>560?2:p.z>180?1:0;
      if(captured&&region!==environmentRegion){scene.environment=cityEnvironments[region].texture;environmentRegion=region;}
    },
    setQuality(low:boolean,cinematic=false){
      sun.castShadow=!low;coolFill.intensity=low?.24:.32;
      const size=low?1024:cinematic?4096:3072;
      if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}
    },
    get captured(){return captured;},
  };
}
