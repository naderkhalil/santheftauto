import * as THREE from 'three';
import { groundHeight } from './route.ts';
import type { CityParcel } from './city-infill-layout.ts';

type Face = CityParcel['fronts'][number];
type Point = [number, number, number];
type Bounds = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };

/** Architectural projection is deliberately bounded: sidewalks and the driving
 * envelope are shared with the parcel planner, rather than guessed here. */
export const CITY_INFILL_PROJECTION = .48;

class GeometryBatch {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  private colorCache = new Map<string, THREE.Color>();

  quad(a: Point, b: Point, c: Point, d: Point, color: string, uv: [number, number, number, number] = [0, 0, 1, 1]) {
    const start = this.positions.length / 3;
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const normal = ab.cross(ac).normalize();
    let tint = this.colorCache.get(color);
    if (!tint) { tint = new THREE.Color(color); this.colorCache.set(color, tint); }
    for (const point of [a, b, c, d]) {
      this.positions.push(...point); this.normals.push(normal.x, normal.y, normal.z);
      this.colors.push(tint.r, tint.g, tint.b);
    }
    this.uvs.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  box(x: number, y: number, z: number, width: number, height: number, depth: number, color: string) {
    const l=x-width/2,r=x+width/2,b=y-height/2,t=y+height/2,n=z+depth/2,s=z-depth/2;
    this.quad([l,b,n],[r,b,n],[r,t,n],[l,t,n],color);
    this.quad([r,b,s],[l,b,s],[l,t,s],[r,t,s],color);
    this.quad([r,b,n],[r,b,s],[r,t,s],[r,t,n],color);
    this.quad([l,b,s],[l,b,n],[l,t,n],[l,t,s],color);
    this.quad([l,t,n],[r,t,n],[r,t,s],[l,t,s],color);
    this.quad([l,b,s],[r,b,s],[r,b,n],[l,b,n],color);
  }

  cylinder(x:number,y:number,z:number,radius:number,height:number,color:string,sides=10,topRadius=radius) {
    for(let i=0;i<sides;i++) {
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
      this.quad([x+cb*radius,y-height/2,z+sb*radius],[x+ca*radius,y-height/2,z+sa*radius],
        [x+ca*topRadius,y+height/2,z+sa*topRadius],[x+cb*topRadius,y+height/2,z+sb*topRadius],color);
      this.quad([x,y+height/2,z],[x+cb*topRadius,y+height/2,z+sb*topRadius],
        [x+ca*topRadius,y+height/2,z+sa*topRadius],[x,y+height/2,z],color);
    }
  }

  mesh(material:THREE.Material,name:string) {
    if(!this.positions.length)return undefined;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(this.normals,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(this.uvs,2));
    geometry.setIndex(this.indices); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(geometry,material); mesh.name=name;mesh.receiveShadow=true;
    this.positions=[];this.normals=[];this.colors=[];this.uvs=[];this.indices=[];
    return mesh;
  }
}

const PALETTES = [
  {wall:'#dca781',trim:'#fff0d4',base:'#a8674d',awning:'#325a4c'},
  {wall:'#e4d4ac',trim:'#fff4da',base:'#b7a17e',awning:'#b44735'},
  {wall:'#90aa95',trim:'#f0e3c3',base:'#5f7766',awning:'#b98635'},
  {wall:'#eadbc1',trim:'#fff6df',base:'#bfa98b',awning:'#325a69'},
  {wall:'#c9846b',trim:'#f2dec0',base:'#9b5744',awning:'#375a4b'},
  {wall:'#d9bb73',trim:'#fff1cf',base:'#ae925e',awning:'#5b334a'},
  {wall:'#c3c9bd',trim:'#f5ecd5',base:'#969d90',awning:'#ab4a36'},
  {wall:'#ead5c6',trim:'#fff1d9',base:'#ad8f7d',awning:'#2d6770'},
];
const SHOP_NAMES = ['CABLE & COFFEE','GOLDEN HOUR BOOKS','HILLTOP FLOWERS','PACIFIC OPTICAL',
  'NORTH STAR RECORDS','THE CITY BAKERY','POST & PAPER','BAY WINDOW GALLERY',
  'SEVEN HILLS MARKET','WEST COAST TAILORS','FOG CITY CAMERA','CLEMENTINE CAFÉ',
  'UNION APOTHECARY','EVERGREEN TEA','POWELL HOUSE','PORTSIDE SUPPLY'];

function makeSignAtlas() {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=2048;
  const ctx=canvas.getContext('2d')!;
  SHOP_NAMES.forEach((name,index)=>{
    // Each atlas row is reflected independently to compensate for the root's
    // semantic-north to render-space reflection, without swapping atlas rows.
    ctx.save();ctx.translate(1024,index*128);ctx.scale(-1,1);
    const palette=PALETTES[index%PALETTES.length];
    ctx.fillStyle=palette.awning;ctx.fillRect(0,0,1024,128);
    ctx.strokeStyle='#e5ce94';ctx.lineWidth=2;ctx.strokeRect(13,10,998,108);
    ctx.fillStyle='#fff1d2';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='600 44px Georgia';ctx.fillText(name,512,59,965);
    ctx.font='500 12px Arial';ctx.letterSpacing='6px';ctx.fillText('S A N   F R A N C I S C O',512,99,640);
    ctx.restore();
  });
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  return map;
}

/** Full city-block architecture with a deliberately small material budget.
 * Silhouettes and windows remain visible in the distance. Fine retail detail,
 * quoins, balcony ironwork and roof equipment are culled in spatial batches. */
export function createCityInfill(parent:THREE.Object3D,parcels:readonly CityParcel[]) {
  const group=new THREE.Group();group.name='San Francisco / continuous neighborhood architecture';parent.add(group);
  const solid=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:.025});
  const glazing=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.38,metalness:.2});
  solid.name='Neighborhood / colored masonry';glazing.name='Neighborhood / recessed reflected glazing';
  const signage=new THREE.MeshStandardMaterial({map:makeSignAtlas(),roughness:.86,vertexColors:true});
  signage.name='Neighborhood / original shopfront atlas';
  type Chunk={body:GeometryBatch;detail:GeometryBatch;glass:GeometryBatch;signs:GeometryBatch;group:THREE.Group;bounds:THREE.Box3;fineMeshes:THREE.Mesh[]};
  const chunks=new Map<string,Chunk>();const bounds:Bounds[]=[];const shadowMeshes:THREE.Mesh[]=[];
  const entrances:{parcelId:string;face:Face;x:number;z:number;threshold:number;supportBottom:number;groundMin:number;groundMax:number;shopWidth:number;steep:boolean}[]=[];
  const chunkSize=136;
  const chunkFor=(p:CityParcel)=>{
    const key=`${Math.floor(p.x/chunkSize)},${Math.floor(p.z/chunkSize)}`;
    let chunk=chunks.get(key);
    if(!chunk){const child=new THREE.Group();child.name=`City block ${key}`;group.add(child);
      chunk={body:new GeometryBatch(),detail:new GeometryBatch(),glass:new GeometryBatch(),signs:new GeometryBatch(),group:child,bounds:new THREE.Box3(),fineMeshes:[]};chunks.set(key,chunk);}
    return chunk;
  };

  for(const p of parcels) {
    const chunk=chunkFor(p),body=chunk.body,detail=chunk.detail,glass=chunk.glass;
    const variation=Math.abs(p.style|0),pal=PALETTES[variation%PALETTES.length];
    const x0=p.x-p.width/2,x1=p.x+p.width/2,z0=p.z-p.depth/2,z1=p.z+p.depth/2;
    const samples=[groundHeight(x0,z0),groundHeight(x1,z0),groundHeight(x0,z1),groundHeight(x1,z1),groundHeight(p.x,p.z)];
    const bottom=Math.min(...samples)-1.5;
    const upperStreet=Math.max(...samples)+.22;
    const roof=upperStreet+p.height;
    const storey=p.district==='downtown'?3.65:3.3;
    const floors=Math.max(2,Math.floor((p.height-4.8)/storey));
    const firstWindow=roof-1.9-(floors-1)*storey;
    const datum=firstWindow-storey/2;
    body.box(p.x,(bottom+roof)/2,p.z,p.width,roof-bottom,p.depth,pal.wall);
    // Layered cornices cast a legible shadow even from the glide camera.
    body.box(p.x,roof-.37,p.z,p.width+.36,.22,p.depth+.36,pal.trim);
    body.box(p.x,roof-.08,p.z,p.width+.82,.19,p.depth+.82,pal.trim);
    body.box(p.x,roof+.12,p.z,p.width+.68,.17,p.depth+.68,'#c5b797');
    body.box(p.x,roof+.24,p.z,p.width-.52,.15,p.depth-.52,'#6e716b');
    for(const sx of [-1,1])body.box(p.x+sx*(p.width/2-.18),roof+.62,p.z,.36,.72,p.depth,pal.wall);
    for(const sz of [-1,1])body.box(p.x,roof+.62,p.z+sz*(p.depth/2-.18),p.width,.72,.36,pal.wall);
    for(const sx of [-1,1])detail.box(p.x+sx*(p.width/2-.18),roof+1,p.z,.49,.10,p.depth+.12,pal.trim);
    for(const sz of [-1,1])detail.box(p.x,roof+1,p.z+sz*(p.depth/2-.18),p.width+.12,.10,.49,pal.trim);

    for(const face of ['north','south','east','west'] as const) {
      const frontage=p.fronts.includes(face),ns=face==='north'||face==='south';
      const nx=face==='east'?1:face==='west'?-1:0,nz=face==='north'?1:face==='south'?-1:0;
      const tx=nz,tz=-nx,span=ns?p.width:p.depth;
      const fx=p.x+nx*(ns?p.depth:p.width)/2,fz=p.z+nz*(ns?p.depth:p.width)/2;
      const point=(along:number,y:number,out:number):Point=>[fx+tx*along+nx*out,y,fz+tz*along+nz*out];
      const panel=(batch:GeometryBatch,along:number,y:number,out:number,w:number,h:number,color:string,uv?:[number,number,number,number])=>
        batch.quad(point(along-w/2,y-h/2,out),point(along+w/2,y-h/2,out),point(along+w/2,y+h/2,out),point(along-w/2,y+h/2,out),color,uv);
      const box=(batch:GeometryBatch,along:number,y:number,out:number,w:number,h:number,d:number,color:string)=>{
        const a=point(along,y,out);batch.box(a[0],a[1],a[2],ns?w:d,h,ns?d:w,color);
      };
      const ledge=(along:number,y:number,w:number,h:number,out:number,color:string)=>{
        const left=along-w/2,right=along+w/2,bottom=y-h/2,top=y+h/2;
        // No hidden back face or tiny end caps: three exposed surfaces retain
        // the cornice shadow at a fraction of the cost of per-window cubes.
        detail.quad(point(left,bottom,out),point(right,bottom,out),point(right,top,out),point(left,top,out),color);
        detail.quad(point(left,top,out),point(right,top,out),point(right,top,.03),point(left,top,.03),color);
        detail.quad(point(left,bottom,.03),point(right,bottom,.03),point(right,bottom,out),point(left,bottom,out),color);
      };
      const cols=Math.max(2,Math.floor((span-.6)/(frontage?3.05:3.7)));
      const pitch=(span-.7)/cols,windowW=Math.min(1.55,pitch*.53);
      const windowH=variation%4===0?2.0:1.85;
      const hasBays=frontage&&(p.district==='powell'||p.district==='bush')&&variation%3===0&&p.height<37;
      // The foundation is dressed all the way down to the terrain. Street-level
      // shops step with steep SF sidewalks while upper floors stay horizontal.
      const segments=Math.max(1,Math.ceil(span/3));
      for(let section=0;section<segments;section++) {
        const along=(section+.5)*span/segments-span/2,a=point(along,0,0);
        const ground=groundHeight(a[0],a[2])+.20;
        const top=Math.max(datum-.18,ground+3.45);
        box(body,along,(bottom+top)/2,.045,span/segments+.02,top-bottom,.10,pal.base);
        for(let course=ground+.52;course<top-.28;course+=.67)
          panel(detail,along,course,.103,span/segments-.045,.025,'#8f826e');
      }
      box(body,0,datum,.15,span+.12,.23,.30,pal.trim);
      // Dark recesses sit behind glazing and trim, with warm occasional
      // curtains. Window proportions vary by individual building, not row.
      for(let floor=0;floor<floors;floor++)for(let col=0;col<cols;col++) {
        const along=(col+.5)*pitch-(span-.7)/2,y=firstWindow+floor*storey;
        const bay=hasBays&&(col===1||col===cols-2)&&cols>3;
        const projection=bay?.38:.025;
        const frameColor=variation%4===1?'#716457':pal.trim;
        if(bay) {
          box(body,along,y,.20,windowW+.48,windowH+.40,.40,pal.trim);
          box(detail,along,y-windowH/2-.25,.23,windowW+.72,.18,.46,pal.trim);
          const a=along-windowW/2-.17,b=along+windowW/2+.17;
          // Narrow return windows make the projecting bays readable from an
          // oblique Powell Street approach, within the sidewalk envelope.
          for(const edge of [a,b]) {
            const aa=point(edge,y-windowH/2,.10),bb=point(edge,y-windowH/2,.41);
            const cc=point(edge,y+windowH/2,.41),dd=point(edge,y+windowH/2,.10);
            if(edge===a)glass.quad(aa,bb,cc,dd,'#4c7177');else glass.quad(bb,aa,dd,cc,'#4c7177');
          }
        }
        panel(body,along,y,projection+.036,windowW+.24,windowH+.22,'#3b494a');
        const reflection=(variation+floor*3+col)%11;
        const tint=reflection===0?'#baa981':reflection<4?'#53737c':reflection<7?'#405964':'#64838b';
        panel(glass,along,y+.035,projection+.045,windowW,windowH,tint);
        panel(glass,along-windowW*.22,y+.09,projection+.048,windowW*.20,windowH*.82,'#7a969c');
        panel(detail,along,y,projection+.06,.07,windowH,frameColor);
        panel(detail,along,y-.08,projection+.065,windowW,.07,frameColor);
        if(frontage) {
          for(const edge of [-1,1])panel(detail,along+edge*(windowW/2+.07),y,projection+.07,.11,windowH+.28,frameColor);
          ledge(along,y-windowH/2-.16,windowW+.42,.13,.365,pal.trim);
          if(variation%2===0)ledge(along,y+windowH/2+.18,windowW+.37,.13,.235,pal.trim);
        } else panel(body,along,y-windowH/2-.1,.07,windowW+.25,.12,pal.trim);
      }
      // A steep lot can expose extra storeys at its downhill end. Dress these
      // occupied lower floors too, instead of leaving a tall blank retaining
      // wall beneath an otherwise finished facade.
      for(let col=0;col<cols;col++) {
        const along=(col+.5)*pitch-(span-.7)/2,a=point(along,0,.1);
        const street=groundHeight(a[0],a[2]);
        for(let y=firstWindow-storey;y-windowH/2>street+4.3;y-=storey) {
          panel(body,along,y,.115,windowW+.24,windowH+.2,'#36443f');
          panel(glass,along,y,.123,windowW,windowH,'#5a7778');
          panel(detail,along,y,.132,.08,windowH,pal.trim);
          panel(detail,along,y-.09,.134,windowW,.075,pal.trim);
          if(frontage)ledge(along,y-windowH/2-.14,windowW+.34,.13,.28,pal.trim);
        }
      }
      // Quoins, paired pilasters and decorative dentils give each narrow lot a
      // separate rhythm, avoiding a single undifferentiated apartment slab.
      for(const edge of [-1,1]) {
        const along=edge*(span/2-.23);
        box(detail,along,(datum+roof-.7)/2,.07,.30,roof-.7-datum,.16,pal.trim);
        if(frontage&&variation%2===0)for(let yy=datum+.45;yy<roof-.8;yy+=.68)
          box(detail,along,yy,.15,.43,.30,.25,pal.trim);
      }
      if(frontage) {
        for(let along=-span/2+.45;along<span/2;along+=.84)
          box(detail,along,roof-.64,.23,.30,.27,.42,pal.trim);
        let maxGrade=0;
        for(let section=0;section<Math.ceil(span/3);section++) {
          const along=-span/2+(section+.5)*span/Math.ceil(span/3);
          const a=point(along-.5,0,.25),b=point(along+.5,0,.25);
          maxGrade=Math.max(maxGrade,Math.abs(groundHeight(a[0],a[2])-groundHeight(b[0],b[2])));
        }
        // SF retail steps with the sidewalk: narrow the downhill bays where
        // a full-width storefront would float or disappear into the hill.
        const steep=maxGrade>.12;
        const shops=Math.max(1,steep?Math.ceil(span/3.8):Math.round(span/7.5));
        for(let shop=0;shop<shops;shop++) {
          const shopPitch=span/shops,along=(shop+.5)*shopPitch-span/2;
          const a=point(along,0,0),floorY=groundHeight(a[0],a[2])+.24;
          const shopH=Math.min(3.2,Math.max(2.55,datum-floorY-.35));
          const width=shopPitch-.62,doorSide=(shop+variation)%2?1:-1;
          const openingY=floorY+shopH/2;
          panel(body,along,openingY,.12,width,shopH,'#263936');
          panel(glass,along,openingY+.08,.135,width-.26,shopH-.32,'#496d6d');
          // Lit transom, a true narrow entry door, brass pull and window stall.
          panel(detail,along,openingY+shopH*.29,.145,width-.3,.12,pal.trim);
          const door=along+doorSide*(width/2-.70);
          const doorGround:number[]=[];
          for(const side of [-.57,0,.57])for(const out of [.12,.46]) {
            const a=point(door+side,0,out);doorGround.push(groundHeight(a[0],a[2]));
          }
          const doorFloor=Math.max(...doorGround)+.12,supportBottom=Math.min(...doorGround)-.08;
          const doorHeight=Math.max(2.25,floorY+shopH-doorFloor-.1);
          box(detail,door,doorFloor+doorHeight/2,.17,1.1,doorHeight,.075,'#b39865');
          panel(glass,door,doorFloor+doorHeight/2+.025,.214,.91,doorHeight-.19,'#263d3b');
          box(detail,door-doorSide*.29,doorFloor+1.16,.245,.045,.48,.06,'#e2c886');
          // The landing is grounded across its full width; the short outer
          // tread meets the slope rather than leaving an unsupported door.
          box(detail,door,(supportBottom+doorFloor)/2,.235,1.14,doorFloor-supportBottom,.24,pal.trim);
          const outerTop=doorFloor-.09;
          box(detail,door,(supportBottom+outerTop)/2,.4075,1.14,outerTop-supportBottom,.105,pal.trim);
          const doorPosition=point(door,doorFloor,.214);
          entrances.push({parcelId:p.id,face,x:doorPosition[0],z:doorPosition[2],threshold:doorFloor,supportBottom,
            groundMin:Math.min(...doorGround),groundMax:Math.max(...doorGround),shopWidth:shopPitch,steep});
          box(detail,along-doorSide*.61,floorY+.31,.21,Math.max(.6,width-1.43),.52,.16,pal.base);
          for(const side of [-1,1])box(detail,along+side*(width/2+.12),openingY,.15,.28,shopH+.1,.21,pal.trim);
          // Awning depth stays under half a metre; even the low camera sees a
          // folded top, a striped valance and the recessed display beneath it.
          const canopyY=Math.max(floorY+shopH+.06,doorFloor+doorHeight+.08);
          box(detail,along,canopyY,.26,width+.14,.13,.43,pal.awning);
          box(detail,along,canopyY-.16,.44,width+.14,.24,.065,pal.awning);
          if(variation%3===1)for(let stripe=-width/2;stripe<width/2;stripe+=.52)
            panel(detail,along+stripe+.13,canopyY-.16,.477,.22,.23,'#eeddb7');
          const signY=canopyY+.55;
          box(detail,along,signY,.14,width+.13,.63,.18,pal.trim);
          const row=(variation+shop*3)%SHOP_NAMES.length;
          panel(chunk.signs,along,signY,.239,width-.02,.52,'#ffffff',[0,(15-row)/16,1,(16-row)/16]);
          // Warm lower display rectangles add scale without adding lights.
          if((variation+shop)%3===0) {
            const display=along-doorSide*.65;
            for(let item=0;item<3;item++)panel(detail,display+(item-1)*.41,floorY+.89+item%2*.16,.15,.28,.5,['#d9b873','#c88763','#d4d6b0'][item]);
          }
        }
        // Selective iron fire escapes, fixed to one bay rather than every
        // window. All railings fit inside the same compact facade projection.
        if(variation%5===2&&span>11) {
          const escape=span*.21;
          for(let floor=1;floor<floors;floor++) {
            const yy=firstWindow+floor*storey-windowH/2-.18;
            box(detail,escape,yy,.24,2.0,.075,.45,'#46504a');
            box(detail,escape,yy+.81,.445,2.04,.055,.055,'#46504a');
            for(let rail=-.9;rail<1;rail+=.3)box(detail,escape+rail,yy+.42,.445,.038,.82,.045,'#46504a');
            for(const side of [-1,1])box(detail,escape+side*.40,yy+storey/2,.24,.035,storey,.045,'#46504a');
            for(let step=0;step<9;step++)box(detail,escape,yy+step*storey/9,.24,.84,.035,.055,'#46504a');
          }
        }
      }
    }
    // Roof silhouettes vary between stair penthouses, chimneys and the timber
    // tanks visible when a car launches over the next block.
    const pentW=Math.min(5.5,p.width*.28),pentD=Math.min(5,p.depth*.28);
    detail.box(p.x+p.width*.16,roof+1.33,p.z-p.depth*.12,pentW,2.0,pentD,pal.base);
    detail.box(p.x+p.width*.16,roof+2.39,p.z-p.depth*.12,pentW+.20,.13,pentD+.20,pal.trim);
    for(let unit=0;unit<2;unit++) {
      const hx=p.x+(unit?-.21:.16)*p.width,hz=p.z+p.depth*.22;
      detail.box(hx,roof+.74,hz,2.15,.92,1.55,'#858e85');
      for(let slat=-.6;slat<=.6;slat+=.2)detail.box(hx+slat,roof+1.21,hz,.05,.025,1.18,'#46544e');
    }
    if(variation%6===1&&p.width>14&&p.depth>14) {
      const tx=p.x-p.width*.21,tz=p.z-p.depth*.22,radius=Math.min(1.45,p.width*.075,p.depth*.075);
      for(const a of [-1,1])for(const b of [-1,1])detail.box(tx+a*radius*.65,roof+1.30,tz+b*radius*.65,.10,2.2,.10,'#48534e');
      detail.cylinder(tx,roof+3.55,tz,radius,2.55,'#916749',14);
      detail.cylinder(tx,roof+5.12,tz,radius*1.11,.55,'#66766c',14,.10);
      for(const yy of [roof+2.55,roof+3.55,roof+4.54])detail.cylinder(tx,yy,tz,radius+.035,.085,'#424f47',14);
    }
    for(let chimney=0;chimney<2;chimney++) {
      const cx=p.x-p.width*.31+chimney*.95,cz=p.z+p.depth*.29;
      detail.box(cx,roof+1.15,cz,.58,1.63,.64,'#a67358');
      detail.box(cx,roof+2.0,cz,.74,.17,.78,pal.trim);
    }
    const bound={id:p.id,minX:x0-CITY_INFILL_PROJECTION,maxX:x1+CITY_INFILL_PROJECTION,minZ:z0-CITY_INFILL_PROJECTION,maxZ:z1+CITY_INFILL_PROJECTION,minY:bottom,maxY:roof+5.5};
    bounds.push(bound);chunk.bounds.expandByPoint(new THREE.Vector3(bound.minX,bottom,bound.minZ));chunk.bounds.expandByPoint(new THREE.Vector3(bound.maxX,bound.maxY,bound.maxZ));
  }

  for(const chunk of chunks.values()) {
    for(const [batch,material,name,fine] of [
      [chunk.body,solid,'masonry and window reveals',false],
      [chunk.glass,glazing,'window reflections',false],
      [chunk.detail,solid,'storefronts, bay trim and ironwork',true],
      [chunk.signs,signage,'original neighborhood shops',true],
    ] as const) {
      const mesh=batch.mesh(material,name);if(!mesh)continue;
      mesh.castShadow=material===solid;chunk.group.add(mesh);
      if(fine)chunk.fineMeshes.push(mesh);if(mesh.castShadow)shadowMeshes.push(mesh);
    }
  }
  group.userData.parcelBounds=bounds;group.userData.parcelCount=parcels.length;
  group.userData.entrances=entrances;
  group.userData.chunkCount=chunks.size;group.userData.materialCount=3;
  group.userData.maxFacadeProjection=CITY_INFILL_PROJECTION;
  let low=false;const localEye=new THREE.Vector3(),inverse=new THREE.Matrix4();
  function update(camera?:THREE.Camera) {
    if(!camera)return;
    camera.getWorldPosition(localEye);group.updateWorldMatrix(true,false);inverse.copy(group.matrixWorld).invert();localEye.applyMatrix4(inverse);
    for(const chunk of chunks.values()) {
      const distance=chunk.bounds.distanceToPoint(localEye);
      chunk.group.visible=distance<(low?640:1080);
      for(const mesh of chunk.fineMeshes)mesh.visible=distance<(low?150:330);
    }
  }
  function setQuality(value:boolean) {low=value;for(const mesh of shadowMeshes)mesh.castShadow=!low;}
  return {group,update,setQuality};
}
