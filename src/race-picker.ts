import { COURSES, type CourseDefinition } from './courses';
import { createCourseRoute } from './course-route';
import { cityMapSvg } from './city-map';
import { CEREBRAL_MAP, CEREBRAL_LANDMARKS } from './cerebral-geography';
import './race-expansion.css';

export function raceUrl(id?: string): string {
  const url = new URL(location.href);
  url.searchParams.delete('race');
  if (id) url.searchParams.set('race', id);
  url.hash = '';
  return url.href;
}

export function courseMap(course: CourseDefinition, dotId?: string): string {
  const route = createCourseRoute(course);
  const points = Array.from({ length: 260 }, (_, i) => route.sampleRoute(i / 259 * route.TRACK_LENGTH));
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const scale = Math.min(304 / Math.max(1, maxX-minX), 166 / Math.max(1,maxZ-minZ));
  const project = (p:{x:number;z:number}) => ({x:180+(p.x-(minX+maxX)/2)*scale,y:108-(p.z-(minZ+maxZ)/2)*scale});
  const path = points.map((p,i)=>{const q=project(p);return `${i?'L':'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`;}).join(' ');
  const start=project(points[0]),end=project(points.at(-1)!);
  if (course.id === 'cerebral-valley') {
    const line = (vertices: readonly {x:number;z:number}[], close = false) => vertices.map((point,index) => {
      const q = project(point); return `${index ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    }).join(' ') + (close ? ' Z' : '');
    const streets = CEREBRAL_MAP.streets.map(street => `<path d="${line(street.points)}" fill="none" stroke="#fffdf3" stroke-width="${Math.max(1.3, street.width * scale).toFixed(2)}" stroke-linecap="round"/>`).join('');
    const parks = CEREBRAL_MAP.parks.map(park => `<path d="${line(park.polygon,true)}" fill="${park.name === 'Alamo Square' ? '#aec5a0' : '#bad0ae'}" stroke="#9caf91" stroke-width=".7"/>`).join('');
    const label = (x:number,z:number,text:string,size=7,colour='#687761') => {
      const q=project({x,z}); return `<text x="${q.x.toFixed(1)}" y="${q.y.toFixed(1)}" text-anchor="middle" fill="${colour}" font-size="${size}" font-weight="700" letter-spacing=".65">${text}</text>`;
    };
    const house = CEREBRAL_LANDMARKS.find(landmark => landmark.id === '261432385')!;
    const cafe = CEREBRAL_LANDMARKS.find(landmark => landmark.id === '261429607')!;
    const markers = [house,cafe,{x:-13,z:31},{x:-25,z:-35}].map(landmark => {
      const q = project(landmark); return `<circle cx="${q.x}" cy="${q.y}" r="2.5" fill="#607661" stroke="#fffdf3" stroke-width="1"/>`;
    }).join('');
    const rainbow = (route.BOOST_ZONES ?? []).map(zone => ['#ec8d9c','#efd075','#8ccbba','#aba1db'].map((color,i) => {
      const a=route.sampleRoute(zone.progress+(zone.end-zone.progress)*i/4),b=route.sampleRoute(zone.progress+(zone.end-zone.progress)*(i+1)/4);
      return `<path d="${line([a,b])}" stroke="${color}" stroke-width="6"/>`;
    }).join('')).join('');
    const flight=route.LAUNCH_ZONES.map(zone=>`<path d="${line([route.sampleRoute(zone.progress),route.sampleRoute(zone.end)])}" fill="none" stroke="#fffbed" stroke-width="2.5" stroke-dasharray="2 2"/>`).join('');
    return `<svg viewBox="0 0 360 216" role="img" aria-label="Cerebral Valley: Hayes Street past Patricia’s Green and Anina, Alamo Square skyline glide, Page Street and Duboce Park" class="course-map-svg" data-min-x="${minX}" data-max-x="${maxX}" data-min-z="${minZ}" data-max-z="${maxZ}" data-scale="${scale}">
      <rect width="360" height="216" fill="#e7e4d9"/>
      ${parks}${streets}
      <path d="${path}" fill="none" stroke="#fffdf2" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${path}" fill="none" stroke="#86739c" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
      ${rainbow}${flight}
      ${label(-956,-18,'ALAMO SQUARE',7.8)}${label(-856,-817,'DUBOCE PARK',7.3)}
      ${label(-189,119,'HAYES VALLEY',7.5)}${label(-4,-148,'PATRICIA’S GREEN',5.4)}${label(house.x+40,house.z-58,'531 PAGE',6.6)}${label(cafe.x+245,cafe.z-53,'CAFÉ RÉVEILLE',6.4)}
      ${markers}<circle cx="${start.x}" cy="${start.y}" r="5" fill="#36564c" stroke="#fffdf2" stroke-width="2"/>
      <circle cx="${end.x}" cy="${end.y}" r="6" fill="#e8bd6c" stroke="#fffdf2" stroke-width="2"/>
      <text x="18" y="24" fill="#53674f" font-size="10" font-weight="700">N ↑</text>
      <text x="18" y="202" fill="#6d7866" font-size="6.7" letter-spacing=".6">SAN FRANCISCO / REAL STREET GEOMETRY</text>
      ${dotId?`<circle id="${dotId}" cx="${start.x}" cy="${start.y}" r="6" fill="#f9fcf2" stroke="#172f43" stroke-width="3"/>`:''}
    </svg>`;
  }
  const landmarks=course.landmarks.filter(l=>l.kind==='park'||l.kind==='view').map(l=>{const p=project(route.routePoint(l.at*route.TRACK_LENGTH,l.side*35));return `<circle cx="${p.x}" cy="${p.y}" r="19" fill="#a7bd91" opacity=".5"/>`;}).join('');
  return `<svg viewBox="0 0 360 216" role="img" aria-label="${course.name} course map, start to finish" class="course-map-svg" data-min-x="${minX}" data-max-x="${maxX}" data-min-z="${minZ}" data-max-z="${maxZ}" data-scale="${scale}">
    <rect width="360" height="216" fill="${['coast','bridge'].includes(course.theme)?'#bdd5cc':'#e7e7d5'}"/>
    <path d="M0 29H360M0 61H360M0 93H360M0 125H360M0 157H360M0 189H360M28 0V216M68 0V216M108 0V216M148 0V216M188 0V216M228 0V216M268 0V216M308 0V216M348 0V216" stroke="#fff9e9" stroke-width="3" opacity=".6"/>
    ${landmarks}<path d="${path}" fill="none" stroke="#fffbed" stroke-width="10" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="${course.accent}" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="${start.x}" cy="${start.y}" r="6" fill="#244e53" stroke="#fff9e5" stroke-width="2"/><circle cx="${end.x}" cy="${end.y}" r="7" fill="#ffdf60" stroke="#244e53" stroke-width="2"/>
    <text x="18" y="24" fill="#315e61" font-size="10" font-weight="700">N ↑</text><text x="18" y="201" fill="#49685d" font-size="8" letter-spacing="1.1">START ● &nbsp; FINISH ◉ &nbsp; / &nbsp; GAME GEOGRAPHY</text>
    ${dotId?`<circle id="${dotId}" cx="${start.x}" cy="${start.y}" r="6" fill="#f9fcf2" stroke="#172f43" stroke-width="3"/>`:''}
  </svg>`;
}

export function mountRacePicker(app:HTMLElement, trigger?:HTMLElement): () => void {
  const dialog=document.createElement('dialog');dialog.className='race-atlas';dialog.setAttribute('aria-labelledby','atlas-title');
  dialog.innerHTML=`<header class="atlas-header"><div><small>WHIMSICAL SF / THE RACE COLLECTION</small><h2 id="atlas-title">Pick your side of the city.</h2><p>Seven routes. A different San Francisco every time.</p></div><button class="atlas-close" aria-label="Close race collection">×</button></header>
    <div class="atlas-grid"><a class="atlas-card" href="${raceUrl()}"><div class="atlas-map">${cityMapSvg('atlas')}</div><div class="atlas-card-copy"><small>01 / THE ORIGINAL · 2.3 KM</small><h3>The City Loop</h3><p>Union Square, Chinatown, and three hills with wings.</p><span>UNION SQUARE → FERRY BUILDING <b>↗</b></span></div></a>
    ${COURSES.map((course,i)=>`<a class="atlas-card" href="${raceUrl(course.id)}" style="--course-accent:${course.accent}"><div class="atlas-map">${courseMap(course)}</div><div class="atlas-card-copy"><small>${String(i+2).padStart(2,'0')} / ${course.difficulty.toUpperCase()} · ${(createCourseRoute(course).TRACK_LENGTH/1000).toFixed(1)} KM</small><h3>${course.name}</h3><p>${course.subtitle}</p><span>${course.fog?'INCLUDES THE FOG RUN':'DRIVE THIS ROUTE'} <b>↗</b></span></div></a>`).join('')}</div><footer class="atlas-footnote">Cerebral Valley follows real streets and terrain. Other courses use compressed game geography. Every route has its own personal best.</footer>`;
  app.append(dialog);
  let ownTrigger:HTMLButtonElement|undefined;
  if(!trigger){ownTrigger=document.createElement('button');ownTrigger.className='text-button choose-race';ownTrigger.id='choose-race';ownTrigger.textContent='CHOOSE A RACE ↗';document.querySelector('.intro-actions')?.append(ownTrigger);trigger=ownTrigger;}
  const open=()=>dialog.showModal();trigger?.addEventListener('click',open);
  dialog.querySelector('button')!.onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  return open;
}
