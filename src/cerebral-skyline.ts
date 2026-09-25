import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Geographic downtown silhouettes for the Alamo Square reveal. Like the
 * district assets, attach directly to the scene outside the reflected car root.
 * Never apply the local neighborhood's 650 m distance culling to this group. */
export async function createCerebralSkyline(): Promise<THREE.Group> {
  const decoder = new DRACOLoader().setDecoderPath('/assets/draco/');
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  try {
    const { scene: group } = await loader.loadAsync('/assets/cerebral-valley/skyline.glb');
    group.name = 'Cerebral / San Francisco skyline at geographic landmark positions';
    group.userData.cerebralSkipAO = true;
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.userData.cerebralSkipAO = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const contextWall = /distant masonry/.test(material.name);
        const distantContext = /distant (masonry|flat rooftops|city ground)/.test(material.name);
        material.envMapIntensity = /glazing/.test(material.name) ? .7 : .32;
        // Named silhouettes use a light haze so they remain legible at 3–4 km.
        // The lower city must recede behind the already-fogged neighborhood:
        // a stronger profile and minimum tint keep the context from becoming a
        // crisp tan strip between the nearby blue haze and distant landmarks.
        material.onBeforeCompile = shader => {
          if (contextWall) {
            // At kilometer distances these measured parcels need a restrained
            // facade rhythm, with derivatives fading subpixel panes smoothly.
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec3 skylinePosition; varying vec3 skylineNormal;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nskylinePosition = position; skylineNormal = normal;');
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', '#include <common>\nvarying vec3 skylinePosition; varying vec3 skylineNormal;')
              .replace('#include <color_fragment>', `#include <color_fragment>
                vec2 skylineTile = vec2(abs(skylineNormal.x) > 0.65 ? skylinePosition.z : skylinePosition.x, skylinePosition.y) / vec2(3.8, 3.25);
                vec2 skylinePane = abs(fract(skylineTile) - 0.5);
                vec2 skylineWidth = max(fwidth(skylineTile), vec2(0.025));
                vec2 skylineWindow = 1.0 - smoothstep(vec2(0.21) - skylineWidth, vec2(0.21) + skylineWidth, skylinePane);
                float skylineDetail = 1.0 - smoothstep(0.38, 1.1, max(skylineWidth.x, skylineWidth.y));
                float skylineGlass = mix(0.1764, skylineWindow.x * skylineWindow.y, skylineDetail) * (1.0 - abs(skylineNormal.y));
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.25, 0.27), skylineGlass * 0.52);
              `);
          }
          shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
            #ifdef USE_FOG
              #ifdef FOG_EXP2
                float skylineDensity = min(fogDensity, ${distantContext ? '0.00037' : '0.00016'});
                float skylineFog = 1.0 - exp(-skylineDensity * skylineDensity * vFogDepth * vFogDepth);
              #else
                float skylineFog = smoothstep(fogNear, fogFar, vFogDepth) * 0.4;
              #endif
              ${distantContext ? 'skylineFog = 0.24 + 0.76 * skylineFog;' : ''}
              gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(skylineFog, ${distantContext ? '0.88' : '0.46'}));
            #endif
          `);
        };
        material.customProgramCacheKey = () => contextWall ? 'cerebral-skyline-context-wall-v3'
          : distantContext ? 'cerebral-skyline-context-mass-v3' : 'cerebral-skyline-haze-v1';
      }
    });
    return group;
  } finally {
    decoder.dispose();
  }
}
