import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const INTERIOR_STYLES = {
  a: {label:'A · 温润木色', description:'一层暖灰瓷砖、木柜；二层浅木地板、米白织物。',
    floor:'#c6c4bd', upperFloor:'#c5a780', wood:'#a98a66', cloth:'#d8d1c2', upperCloth:'#e6dfd2', accent:'#8d9b87'},
  b: {label:'B · 清爽灰白', description:'一层米白瓷砖、胡桃柜；二层浅灰地板、灰蓝织物。',
    floor:'#e1d7c7', upperFloor:'#c0bcb5', wood:'#785c47', cloth:'#d8d7d0', upperCloth:'#a9bbc1', accent:'#72878d'}
};

// 按当前房间净界制作可切换样板；不改墙体、洞口及用途，选色后再写入正式模型。
export function createInteriorPreview(p, plan, styleId='a') {
  const style=INTERIOR_STYLES[styleId], upper=plan.level===2;
  const group=new THREE.Group();
  group.name=`InteriorPreview_${plan.level}`;
  group.userData={concept_only:true, preview_only:true, style:styleId};
  const colors={floor:upper?style.upperFloor:style.floor, floorAlt:upper?style.upperFloor:style.floor,
    wood:style.wood, cloth:upper?style.upperCloth:style.cloth, accent:style.accent,
    stone:'#d9d6cc', white:'#eeeae1', metal:'#41494a', screen:'#26363e', rug:upper?'#d5cdbb':'#e1dace', shade:'#f1e3c5'};
  const materials=Object.fromEntries(Object.entries(colors).map(([name,color])=>[name,new THREE.MeshStandardMaterial({
    name:`interior/${styleId}/${plan.level}/${name}`, color,
    roughness:['cloth','rug'].includes(name)?1:name==='screen'?.2:name==='metal'?.4:.8,
    metalness:name==='metal'?.35:0
  })]));
  materials.floorAlt.color.multiplyScalar(.965);
  materials.shade.emissive.set('#eed8b2');materials.shade.emissiveIntensity=.18;
  const buckets=new Map();
  const add=(name, geometry, x,y,z)=>{
    geometry.translate(x,z,-y);
    const flat=geometry.index?geometry.toNonIndexed():geometry;
    if(flat!==geometry)geometry.dispose();
    flat.deleteAttribute('uv');
    if(!buckets.has(name))buckets.set(name,[]);
    buckets.get(name).push(flat);
  };
  const box=(name,x0,y0,x1,y1,z,h,rounded=false)=>add(name,
    rounded?new RoundedBoxGeometry(x1-x0,h,y1-y0,2,Math.min(.035,h/4)):
      new THREE.BoxGeometry(x1-x0,h,y1-y0),(x0+x1)/2,(y0+y1)/2,z+h/2);
  const cylinder=(name,x,y,z,h,r,top=r)=>add(name,new THREE.CylinderGeometry(top,r,h,20),x,y,z+h/2);
  const floor=space=>{
    const [x0,y0,x1,y1]=space.clear_bounds_mm.map(n=>n/1000);
    const plank=upper, dx=plank?.18:.8, dy=plank?1.2:.8;
    let i=0;
    for(let x=x0;x<x1-.002;x+=dx,i++) {
      let j=0;
      for(let y=y0-(plank&&i%2?.6:0);y<y1-.002;y+=dy,j++) {
        box((i+j)%3?'floor':'floorAlt',x+.0015,Math.max(y,y0)+.0015,Math.min(x+dx,x1)-.0015,Math.min(y+dy,y1)-.0015,.012,.012);
      }
    }
  };
  const hall=plan.spaces.find(s=>s.id==='hall');
  const master=plan.spaces.find(s=>s.id==='master-bedroom');
  floor(hall);floor(master);
  for(const room of [hall,master]) {
    const [x0,y0,x1,y1]=room.clear_bounds_mm.map(n=>n/1000);
    const ceiling=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,.04,y1-y0),new THREE.MeshStandardMaterial({color:'#f0ede5',roughness:.95}));
    ceiling.position.set((x0+x1)/2,p.wall_height/1000-.02,-(y0+y1)/2);
    ceiling.castShadow=true;ceiling.receiveShadow=true;
    ceiling.userData.preview_ceiling=true;group.add(ceiling);
  }

  // 厅堂东侧保留 1.16 米通道，西北套间入口保持敞开。
  box('rug',5.95,11.1,9.22,14.2,.026,.009,true);
  for(const x of [8.56,9.25])for(const y of [11.4,14])cylinder('metal',x,y,.03,.15,.03);
  box('wood',8.45,11.25,9.4,14.15,.16,.16,true);
  box('cloth',9.19,11.25,9.4,14.15,.3,.64,true);
  for(let i=0;i<3;i++)box('cloth',8.5,11.46+i*.825,9.2,12.265+i*.825,.33,.16,true);
  for(const y of [11.25,13.97])box('cloth',8.45,y,9.4,y+.18,.31,.32,true);
  box('accent',8.92,11.64,9.2,12.13,.49,.36,true);
  box('white',8.94,13.23,9.21,13.73,.49,.36,true);
  box('wood',6.96,12.4,7.38,12.97,.035,.31,true);
  box('stone',6.64,12.2,7.72,13.17,.345,.045,true);
  cylinder('wood',7.17,12.67,.39,.02,.19);
  cylinder('white',7.11,12.67,.41,.09,.032);
  cylinder('white',7.28,12.65,.41,.09,.032);
  box('metal',4.14,11.3,4.5,13.66,.026,.075);
  box('wood',4.12,11.27,4.59,13.69,.10,.34,true);
  for(let y=11.3;y<13.6;y+=.6)box('wood',4.59,y,4.61,Math.min(y+.59,13.66),.12,.3);
  box('metal',4.14,11.61,4.20,13.27,1.01,.94,true);
  box('screen',4.201,11.64,4.208,13.24,1.04,.88);
  cylinder('metal',8.75,14.67,.026,.035,.18);
  cylinder('metal',8.75,14.67,.06,1.29,.014);
  cylinder('shade',8.75,14.67,1.35,.30,.24,.17);

  // 主卧 1.8×2.0 米床；东侧入套间的通路与南窗前均留空。
  box('rug',.70,8.9,3.05,11.28,.026,.009,true);
  box('wood',.95,9.1,2.75,11.1,.055,.25,true);
  box('wood',.86,11.1,2.84,11.22,.04,1.02,true);
  box('white',.97,9.12,2.73,11.08,.305,.2,true);
  box('cloth',.93,9.10,2.77,10.56,.49,.055,true);
  box('accent',.93,9.47,2.77,9.92,.55,.025,true);
  for(const x of [1.12,1.94])box('white',x,10.60,x+.65,11.0,.51,.105,true);
  box('wood',.4,10.48,.84,11.05,.05,.43,true);
  cylinder('metal',.62,10.75,.48,.025,.095);
  cylinder('metal',.62,10.75,.505,.19,.012);
  cylinder('shade',.62,10.75,.695,.18,.115,.09);
  box('wood',3.31,7.58,3.9,9.02,.026,2.37);
  for(let y=7.60;y<9;y+=.47) {
    box('white',3.28,y,3.31,Math.min(y+.46,9),.07,2.29);
    box('metal',3.268,y+.39,3.28,y+.402,1.03,.24);
  }
  cylinder('white',.37,8.3,.025,.26,.12,.15);
  // 窗帘是实体折线布面，只放在窗洞两侧。
  for(const [a,b] of [[.61,1.07],[2.94,3.39]]) {
    const positions=[];
    const n=24;
    for(let i=0;i<n;i++) {
      const x0=a+(b-a)*i/n,x1=a+(b-a)*(i+1)/n;
      const y0=7.40+Math.sin(i/n*8*Math.PI)*.045,y1=7.40+Math.sin((i+1)/n*8*Math.PI)*.045;
      positions.push(x0,.06,-y0,x1,.06,-y1,x1,2.72,-y1,x0,.06,-y0,x1,2.72,-y1,x0,2.72,-y0);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    add('cloth',geometry,0,0,0);
  }
  box('metal',.60,7.38,3.4,7.42,2.75,.025);
  for(const [name,geometries] of buckets) {
    const geometry=mergeGeometries(geometries);
    geometries.forEach(item=>item.dispose());
    const material=materials[name];
    if(name==='cloth')material.side=THREE.DoubleSide;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`interior-preview/${name}`;
    mesh.castShadow=!['floor','floorAlt','rug'].includes(name);mesh.receiveShadow=true;
    group.add(mesh);
  }
  group.userData.clearances={hallEast:1.21,masterBedEast:1.16};
  return group;
}
