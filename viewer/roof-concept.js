// 用户选定曲周参考图的瓦顶方向，借鉴另一方案的浅墙深框；以下均为可调整方案尺寸。
export const ROOF_PROPOSAL = Object.freeze({
  southEaveMm: 600, eaveHeightMm: 220, ridgeRiseMm: 1800,
  deckThicknessMm: 120, tileWidthMm: 300, tileGaugeMm: 330, tileLengthMm: 390,
  gutterFallPerM: .002, downpipeDiameterMm: 110
});
export const ROOF_MATERIALS = Object.freeze([
  { name: 'roof/tile', color: '#555a5c', roughness: .92 },
  { name: 'roof/plaster', color: '#eeece4', roughness: .95 },
  { name: 'roof/soffit', color: '#777b79', roughness: .90 },
  { name: 'roof/metal', color: '#41494b', roughness: .60 },
  { name: 'roof/tile-light', color: '#595e60', roughness: .92 }
]);
const cross2 = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const signedArea = p => p.reduce((sum,a,i) => {const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2;
const ccw = p => signedArea(p)<0?[...p].reverse():p;

// 凸多边形裁剪让边瓦止于斜脊，不穿出屋面。坐标仍是东、北、高。
function clipPolygon(subject, boundary) {
  let output=subject;
  for(let i=0;i<boundary.length;i++) {
    const a=boundary[i], b=boundary[(i+1)%boundary.length], input=output; output=[];
    for(let j=0;j<input.length;j++) {
      const p=input[j],q=input[(j+1)%input.length],dp=cross2(a,b,p),dq=cross2(a,b,q);
      if(dp>=-1e-9) output.push(p);
      if((dp>0&&dq<0)||(dp<0&&dq>0)) {
        const t=dp/(dp-dq);output.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);
      }
    }
  }
  return output.filter((p,i) => {
    const prev=output[(i+output.length-1)%output.length],next=output[(i+1)%output.length];
    return Math.hypot(p[0]-prev[0],p[1]-prev[1])>1e-7 && Math.abs(cross2(prev,p,next))>1e-8;
  });
}

function assembly() {
  const positions=[],triangles=[],materials=[],components=[];
  function solid(id,points,faces,material) {
    const vertexStart=positions.length,triangleStart=triangles.length;
    const center=points.reduce((s,p)=>s.map((v,i)=>v+p[i]/points.length),[0,0,0]);
    positions.push(...points.map(([x,y,h])=>[x,h,-y]));
    for(let polygon of faces) {
      const [a,b,c]=polygon.slice(0,3).map(i=>points[i]);
      const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(normal.reduce((n,v,i)=>n+v*(a[i]-center[i]),0)<0) polygon=[...polygon].reverse();
      for(let i=1;i<polygon.length-1;i++) {
        triangles.push([polygon[0],polygon[i],polygon[i+1]].map(n=>n+vertexStart));materials.push(material);
      }
    }
    components.push({id,vertexStart,vertexCount:points.length,triangleStart,triangleCount:triangles.length-triangleStart});
  }
  function layer(id,polygon,height,thickness,material) {
    if(polygon.length<3||Math.abs(signedArea(polygon))<1e-6)return;
    const p=ccw(polygon),n=p.length;
    const points=[-thickness,0].flatMap(d=>p.map(([x,y])=>[x,y,height(x,y)+d]));
    solid(id,points,[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>n+i),
      ...p.map((_,i)=>[i,(i+1)%n,(i+1)%n+n,i+n])],material);
  }
  const box=(id,x0,y0,x1,y1,z0,z1,material)=>layer(id,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],()=>z1,z1-z0,material);
  function ridge(id,a,b) {
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length,ny=(b[0]-a[0])/length;
    const section=[[-.14,0],[.14,0],[.14,.045],[0,.115],[-.14,.045]];
    const count=Math.ceil(length/.36);
    for(let i=0;i<count;i++) {
      const points=[i/count,Math.min(1,(i+1)/count+.002)].flatMap(t=>section.map(([u,h])=>
        [a[0]+(b[0]-a[0])*t+nx*u,a[1]+(b[1]-a[1])*t+ny*u,a[2]+(b[2]-a[2])*t+h]));
      solid(id,points,[[0,1,2,3,4],[5,6,7,8,9],...[0,1,2,3,4].map(j=>[j,(j+1)%5,(j+1)%5+5,j+5])],0);
    }
  }
  return {positions,triangles,materials,components,layer,box,ridge};
}

/** 二层局部坐标；四坡薄屋面、搭接瓦与檐沟分别生成闭合实体。 */
export function roofEnvelope(p) {
  if(!p||p.units!=='mm')throw new Error('屋顶方案需要毫米参数。');
  for(const key of ['site_width','house_depth','courtyard_depth','wall_height','floor_to_floor'])
    if(!Number.isFinite(p[key])||p[key]<=0)throw new Error('屋顶参数无效：'+key);
  if(p.upper_front_area!=='courtyard_void')throw new Error('前院挑空约束改变，请先复核屋顶范围。');
  const q=ROOF_PROPOSAL,w=p.site_width/1000,s=p.courtyard_depth/1000,n=s+p.house_depth/1000,b=p.wall_height/1000;
  const x0=.16,x1=w-.16,y0=s-q.southEaveMm/1000,y1=n-.16;
  const run=(y1-y0)/2,ry=(y0+y1)/2,rx0=x0+run,rx1=x1-run;
  if(rx0>=rx1)throw new Error('当前四坡屋顶需要重新确定屋脊方向。');
  const low=b+q.eaveHeightMm/1000,high=low+q.ridgeRiseMm/1000,pitch=(high-low)/run;
  const m=assembly(),{box,layer,ridge}=m;
  box('ceiling',0,s,w,n,b,b+.10,1);
  box('south-eave-soffit',0,y0,w,s+.12,b+.035,b+.10,2);
  box('south-cornice',0,y0+.07,w,y0+.18,b-.04,b+.035,1);
  const regions=[
    {id:'south',poly:[[x0,y0],[x1,y0],[rx1,ry],[rx0,ry]],height:(x,y)=>low+(y-y0)*pitch,point:(u,v)=>[u,y0+v],from:x0,to:x1},
    {id:'north',poly:[[rx0,ry],[rx1,ry],[x1,y1],[x0,y1]],height:(x,y)=>low+(y1-y)*pitch,point:(u,v)=>[u,y1-v],from:x0,to:x1},
    {id:'west',poly:[[x0,y0],[rx0,ry],[x0,y1]],height:(x,y)=>low+(x-x0)*pitch,point:(u,v)=>[x0+v,u],from:y0,to:y1},
    {id:'east',poly:[[x1,y0],[x1,y1],[rx1,ry]],height:(x,y)=>low+(x1-x)*pitch,point:(u,v)=>[x1-v,u],from:y0,to:y1}
  ];
  for(const face of regions) {
    const boundary=ccw(face.poly);
    layer(face.id+'-deck',boundary,face.height,q.deckThicknessMm/1000,2);
    for(let row=0,v=0;v<run;row++,v+=q.tileGaugeMm/1000) {
      for(let col=0,u=face.from;u<face.to;col++,u+=q.tileWidthMm/1000) {
        const end=Math.min(u+q.tileWidthMm/1000-.008,face.to);
        const poly=clipPolygon([face.point(u,v),face.point(end,v),face.point(end,v+q.tileLengthMm/1000),face.point(u,v+q.tileLengthMm/1000)],boundary);
        // 瓦片下沿略抬起，上一排压住下一排，形成实际搭接阴影。
        const variation=(Math.imul(row+1,73856093)^Math.imul(col+1,19349663)^face.id.charCodeAt(0))>>>0;
        layer('tile/'+face.id,poly,(x,y)=>face.height(x,y)+.024+(v+q.tileLengthMm/1000-(face.height(x,y)-low)/pitch)*.04,
          .018,variation%13===0?4:0);
      }
    }
  }
  ridge('ridge-cap',[rx0,ry,high+.035],[rx1,ry,high+.035]);
  for(const [a,c] of [[[x0,y0,low],[rx0,ry,high]],[[x0,y1,low],[rx0,ry,high]],[[x1,y0,low],[rx1,ry,high]],[[x1,y1,low],[rx1,ry,high]]]) {
    // 脊瓦两端略缩进，保持檐沟和宅界边缘不被脊瓦穿出。
    const inset=.035;
    ridge('hip-cap',a.map((v,i)=>v+(c[i]-v)*inset+(i===2?.036:0)),c.map((v,i)=>v+(i===2?.036:0)));
  }
  // 环形檐沟在角部连通，北侧分向东西，再朝南院两个落水口找坡。
  // 2‰ 与 110 mm 只用于表现构件关系，未按汇水面积和当地暴雨强度验算。
  const sy=y0-.18,si=y0+.02,ni=n-.17,cx=.12,cy=(sy+si)/2;
  const base=low-.20,grade=q.gutterFallPerM;
  const southHeight=x=>base+Math.min(Math.abs(x-cx),Math.abs(x-(w-cx)))*grade;
  const sideHeight=y=>base+cx*grade+(y-si)*grade;
  const northHeight=x=>sideHeight(ni)+Math.min(x,w-x)*grade;
  const rectangle=(id,a,b,c,d,height)=>layer(id,[[a,b],[c,b],[c,d],[a,d]],height,.015,3);
  const outlets=[cx,w-cx].map((x,i)=>({id:i?'east':'west',position:[x,cy,southHeight(x)],diameterMm:q.downpipeDiameterMm}));
  const breaks=[0,cx-.07,cx+.07,w/2,w-cx-.07,w-cx+.07,w];
  for(let i=0;i<breaks.length-1;i++) {
    if(i===1||i===4)continue;
    rectangle('south-gutter-bottom',breaks[i],sy,breaks[i+1],si,x=>southHeight(x));
  }
  for(const outlet of outlets) {
    const [x,y,h]=outlet.position;
    // 槽底留真正贯通的圆形落水口，环周分成凸片，避免用黑色贴片冒充洞口。
    const perimeter=[[.07,0],[.07,.1],[0,.1],[-.07,.1],[-.07,0],[-.07,-.1],[0,-.1],[.07,-.1]];
    const inner=perimeter.map(([a,b])=>{const r=.051/Math.hypot(a,b);return [a*r,b*r];});
    for(let i=0;i<8;i++) {
      const j=(i+1)%8;
      layer('south-gutter-outlet-rim',[perimeter[i],perimeter[j],inner[j],inner[i]].map(([a,b])=>[x+a,y+b]),
        xx=>southHeight(xx),.015,3);
    }
  }
  rectangle('west-gutter-bottom',0,si,.17,ni,(x,y)=>sideHeight(y));
  rectangle('east-gutter-bottom',w-.17,si,w,ni,(x,y)=>sideHeight(y));
  for(const [a,b] of [[0,w/2],[w/2,w]])rectangle('north-gutter-bottom',a,ni,b,n,x=>northHeight(x));
  // 内外两道连续边，不在四角设置横向挡板。
  for(const [id,a,b,c,d] of [
    ['south',0,sy,w,sy+.016],['north',0,n-.016,w,n],
    ['west',0,sy+.016,.016,n-.016],['east',w-.016,sy+.016,w,n-.016],
    ['south-inner',.17,si-.016,w-.17,si],['north-inner',.17,ni,w-.17,ni+.016],
    ['west-inner',.154,si,.17,ni],['east-inner',w-.17,si,w-.154,ni]
  ])box(id+'-gutter-lip',a,b,c,d,base-.016,low-.006,3);
  const heights=m.positions.map(v=>v[1]);
  return {positions:m.positions,triangles:m.triangles,materials:m.materials,components:m.components,
    footprintMm:[0,(y0-.18)*1000,p.site_width,n*1000],
    localMinHeightM:Math.min(...heights),worldRidgeHeightMm:(Math.max(...heights)+p.floor_to_floor/1000)*1000,
    drainageOutlets:outlets,
    status:'needs_review',classification:'hipped_tiled_roof_proposal',drainageStatus:'sloped_gutters_and_outlets_proposed_capacity_and_outfall_pending'};
}

export function roofIsVisible(state) {
  return state.roof===true&&['whole','courtyard'].includes(state.view)&&state.cut===false;
}
export function createRoofConcept(THREE,parameters) {
  const envelope=roofEnvelope(parameters),source=new THREE.BufferGeometry();
  source.setAttribute('position',new THREE.Float32BufferAttribute(envelope.positions.flat(),3));
  const faces=envelope.triangles.map((face,i)=>({face,material:envelope.materials[i]})).sort((a,b)=>a.material-b.material);
  source.setIndex(faces.flatMap(p=>p.face));
  const geometry=source.toNonIndexed();source.dispose();geometry.computeVertexNormals();
  for(let start=0;start<faces.length;) {
    let end=start+1;while(end<faces.length&&faces[end].material===faces[start].material)end++;
    geometry.addGroup(start*3,(end-start)*3,faces[start].material);start=end;
  }
  const mesh=new THREE.Mesh(geometry,ROOF_MATERIALS.map(options=>new THREE.MeshStandardMaterial(options)));
  mesh.name='RoofConcept/roof-assembly';mesh.castShadow=true;mesh.receiveShadow=true;
  const group=new THREE.Group();group.name='RoofConcept';
  group.userData={concept_only:true,model_status:'needs_review',source:'viewer/roof-concept.js',classification:envelope.classification,proposal:{...ROOF_PROPOSAL}};
  group.add(mesh);group.visible=false;return group;
}
export function attachRoofConcept(THREE,upperFloor,parameters) {
  const embedded=upperFloor.getObjectByName('RoofConcept');
  if(embedded)return {group:embedded,embedded:true};
  const group=createRoofConcept(THREE,parameters);upperFloor.add(group);return {group,embedded:false};
}
