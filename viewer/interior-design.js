import * as THREE from 'three';
import {interiorLayout} from './interior-layout.js';
import {interiorBuilder,furnish} from './interior-geometry.js';
import {servicePoints} from './service-points.js';
import {finishLayout,drawFinishes} from './interior-finishes.js';

export const INTERIOR_STYLES={
  a:{label:'A · 温润木色',description:'一层暖灰瓷砖、木柜；二层浅木地板、米白织物。',floor:'#c6c4bd',upperFloor:'#c5a780',wood:'#a98a66',cloth:'#d8d1c2',upperCloth:'#e6dfd2',accent:'#8d9b87'},
  b:{label:'B · 清爽灰白',description:'一层米白瓷砖、胡桃柜；二层浅灰地板、灰蓝织物。',floor:'#e1d7c7',upperFloor:'#c0bcb5',wood:'#785c47',cloth:'#d8d7d0',upperCloth:'#a9bbc1',accent:'#72878d'}
};

export function interiorMaterials(level,styleId) {
  const s=INTERIOR_STYLES[styleId],upper=level===2;
  const colors={floor:upper?s.upperFloor:s.floor,floorAlt:upper?s.upperFloor:s.floor,wood:s.wood,
    cloth:upper?s.upperCloth:s.cloth,accent:s.accent,stone:'#d9d6cc',white:'#eeeae1',ceramic:'#f4f3ed',metal:'#41494a',
    steel:'#b6bfbd',screen:'#26363e',rug:'#ddd5c6',shade:'#f1e3c5',tile:'#c2c7c5',tileWall:'#e0e3df',
    glass:'#c0d1d0',mirror:'#bccbcf',ceiling:'#f0ede5',lamp:'#f4e4c8'};
  return Object.fromEntries(Object.entries(colors).map(([key,color])=> {
    const options={color,roughness:['cloth','rug'].includes(key)?1:['metal','steel','screen','mirror'].includes(key)?.3:.85,
      metalness:['steel','mirror'].includes(key)?.65:key==='metal'?.35:0};
    if(key==='floorAlt')options.color='#'+new THREE.Color(color).multiplyScalar(.965).getHexString();
    if(['lamp','shade'].includes(key))Object.assign(options,{emissive:'#eed8b2',emissiveIntensity:key==='lamp'?1.2:.18});
    if(key==='glass')Object.assign(options,{transparent:true,opacity:.2,roughness:.12,side:THREE.DoubleSide});
    if(key==='cloth')options.side=THREE.DoubleSide;
    return [key,options];
  }));
}

export function applyInteriorStyle(group,level,styleId) {
  const options=interiorMaterials(level,styleId);
  group.traverse(obj=>{
    const key=obj.userData.interior_material;
    if(obj.isMesh && key) {
      const o=options[key];obj.material.color.set(o.color);
      obj.material.roughness=o.roughness;obj.material.metalness=o.metalness;
    }
  });
  group.userData.interior_style=styleId;
}

export function createInteriorDesign(p,plan,styleId='a') {
  const layout=interiorLayout(p,plan),finishes=finishLayout(p,plan,layout),group=new THREE.Group();
  group.name=`InteriorDesign_${plan.level}`;
  group.userData={interior_root:true,model_component:true,concept_only:true,model_status:'needs_review',interior_style:styleId,layout,service_points:servicePoints(layout),finish_proposal:finishes.dimensions};
  const materials=Object.fromEntries(Object.entries(interiorMaterials(plan.level,styleId))
    .map(([name,options])=>[name,new THREE.MeshStandardMaterial({name:`interior/${plan.level}/${name}`,...options})]));
  const g=interiorBuilder(group,materials),b=g.box;
  for(const r of layout.rooms) {
    const [x,y,x1,y1]=r.bounds,wet=r.id.startsWith('bathroom')||r.id==='kitchen';
    const plank=plan.level===2&&!wet,dx=plank?.18:wet?.6:.8,dy=plank?1.2:dx;
    g.context(r.id,'floor');
    let i=0;
    for(let a=x;a<x1-.004;a+=dx,i++) {
      let j=0;
      for(let q=y-(plank&&i%2?.6:0);q<y1-.004;q+=dy,j++)
        b(wet?'tile':(i+j)%3?'floor':'floorAlt',a+.0015,Math.max(q,y)+.0015,Math.min(a+dx,x1)-.0015,Math.min(q+dy,y1)-.0015,.010,.014);
    }
    // 顶面按房间分配边界覆盖连接处；楼层/剖切视图可以单独隐藏，不改变室内高度。
    const xs=r.polygon.map(a=>a[0]),ys=r.polygon.map(a=>a[1]);
    g.context(r.id,'ceiling');
    b('ceiling',Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys),p.wall_height/1000-.025,.025);
    if(wet) {
      g.context(r.id,'finish');
      // 卫浴西墙铺面收在高窗窗台以下；门洞与西侧高窗保持原样。
      if(r.id.startsWith('bathroom')) {
        b('tileWall',x,y,x+.012,y1,.025,2.015);
        b('tileWall',x,y,x1,y+.012,.025,2.015);
        b('tileWall',x,y1-.012,x1,y1,.025,2.015);
      }
    }
  }
  // 门洞和敞口补同标高过门面；不改变原来的通行关系。
  for(const c of plan.connections) {
    if(!c.spaces.every(id=>layout.rooms.some(r=>r.id===id)))continue;
    let a,b1,width=.18;
    if(c.opening_id) {
      const o=plan.openings.find(o=>o.id===c.opening_id),w=plan.walls.find(w=>w.id===o.wall_id);
      const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],l=Math.hypot(dx,dy);
      a=[(w.a[0]+dx/l*o.offset)/1000,(w.a[1]+dy/l*o.offset)/1000];
      b1=[a[0]+dx/l*o.width/1000,a[1]+dy/l*o.width/1000];width=w.thickness/1000;
    } else if(c.segment){[a,b1]=c.segment.map(v=>v.map(n=>n/1000));}
    else continue;
    g.context(c.spaces[0],'floor');
    if(Math.abs(a[0]-b1[0])<.001)b('stone',a[0]-width/2,Math.min(a[1],b1[1]),a[0]+width/2,Math.max(a[1],b1[1]),.010,.014);
    else b('stone',Math.min(a[0],b1[0]),a[1]-width/2,Math.max(a[0],b1[0]),a[1]+width/2,.010,.014);
  }
  drawFinishes(finishes,g);
  for(const item of layout.items){g.context(item.space);furnish(item,g);}
  for(const l of layout.lights) {
    g.context(l.space,'ceiling');const [x,y,h]=l.position;
    g.cylinder('white',x,y,h,.065,l.space==='hall'?.35:.22);
    g.cylinder('lamp',x,y,h-.006,.008,l.space==='hall'?.32:.195);
  }
  const master=layout.rooms.find(r=>r.id==='master-bedroom'),[mx,my]=master.bounds;
  g.context(master.id);
  for(const [a,z] of [[mx+.37,mx+.83],[mx+2.70,mx+3.15]]) {
    const positions=[],n=24;
    for(let i=0;i<n;i++) {
      const x0=a+(z-a)*i/n,x1=a+(z-a)*(i+1)/n;
      const y0=my+.16+Math.sin(i/n*8*Math.PI)*.045,y1=my+.16+Math.sin((i+1)/n*8*Math.PI)*.045;
      positions.push(x0,.06,-y0,x1,.06,-y1,x1,2.72,-y1,x0,.06,-y0,x1,2.72,-y1,x0,2.72,-y0);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();g.add('cloth',geo);
  }
  b('metal',mx+.36,my+.14,mx+3.16,my+.18,2.75,.025);
  g.context('hall','floor');
  const hall=layout.rooms.find(r=>r.id==='hall').bounds;
  b('rug',hall[0]+1.86,hall[1]+.51,hall[0]+5.13,hall[1]+3.61,.026,.009,true);
  g.finish();group.updateMatrixWorld(true);return group;
}

export function createUseZones(layout) {
  const group=new THREE.Group();group.name='InteriorUseZones';
  group.userData.comparison_only=true;
  for(const zone of layout.zones) {
    const [x,y,x1,y1]=zone.bounds;
    const geometry=new THREE.PlaneGeometry(x1-x,y1-y);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#3b9293',transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set((x+x1)/2,.042,-(y+y1)/2);
    mesh.name=zone.id;mesh.userData.label=zone.label;group.add(mesh);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#276c70',transparent:true,opacity:.85})));
  }
  return group;
}
