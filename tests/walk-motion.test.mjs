import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createWalkWorld,overlap} from '../viewer/walk-world.js';
import {createInteriorDesign} from '../viewer/interior-design.js';
import {interiorLayout} from '../viewer/interior-layout.js';
import {createDoorDesign} from '../viewer/door-design.js';
import {collectMotions,poseMotion,motionObstacle} from '../viewer/motion-controls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];
const world=createWalkWorld(p,plans),roots=new Map();
for(const plan of plans){const root=new THREE.Group();root.position.y=(plan.level-1)*p.floor_to_floor/1000;root.add(createInteriorDesign(p,plan),createDoorDesign(p,plan));root.updateMatrixWorld(true);roots.set(plan.level,root);}
const motions=collectMotions(roots);
const dynamic=()=>motions.map(motionObstacle);
function route(points,start={x:6.4,y:3.7,z:world.surface(6.4,3.7,-.45)}) {
  let position=start;
  for(const [x,y] of points){position=world.move(position,x-position.x,y-position.y,dynamic());assert.ok(Math.hypot(position.x-x,position.y-y)<.06,`路线在 ${JSON.stringify(position)} 遇阻，目标 ${x},${y}`);}
  return position;
}

test('从院子经三级台阶与折返楼梯到二层，原路返回',()=>{
  const path=[[6.4,8],[10.4,8],[13.8,8],[13.8,9.24],[10.3,9.24]];
  const top=route(path);assert.ok(Math.abs(top.z-3.224)<.01);
  const bottom=route([...path.slice(0,-1).reverse(),[6.4,3.7]],top);assert.ok(bottom.z<-.4);
});

test('墙体、关闭的门、床和挑空边缘不能穿越',()=>{
  const blocked=world.move({x:6.4,y:9.7,z:.024},0,1.4,dynamic());assert.ok(blocked.y<10.4);
  const door=motions.find(m=>m.data.opening_id==='main-hall-door'&&m.level===1);
  poseMotion(door,1);
  route([[6.4,11.2]],{x:6.4,y:9.7,z:.024});poseMotion(door,0);
  const wall=world.move({x:.8,y:8.5,z:.024},-2,0,dynamic());assert.ok(wall.x>.4);
  const bed=world.move({x:1.8,y:8.3,z:.024},0,2,dynamic());assert.ok(bed.y<9.1);
  const voidEdge=world.move({x:6.4,y:8,z:3.224},0,-3,dynamic());assert.ok(voidEdge.y>7);
  const rail=world.move({x:12,y:8,z:world.stairAt(12,8)},0,1.3,dynamic());assert.ok(rail.y<8.58);
});

test('较大帧间隔的快走仍按小步碰撞，新增收纳柜不能穿过',()=>{
  for(const dt of [1/60,.10,.12]) {
    let position={x:6.4,y:9.7,z:.024};
    for(let t=0;t<1;t+=dt)position=world.move(position,0,3.6*dt,dynamic());
    assert.ok(position.y<10.4,'快走不能越过关闭的入户门');
  }
  for(const plan of plans)for(const item of interiorLayout(p,plan).items.filter(i=>i.type==='storage-cabinet')){
    const [x,y,x1,y1]=item.bounds,west=item.facing==='west';
    const position=world.move({x:west?x-.6:x1+.6,y:(y+y1)/2,z:(plan.level-1)*3.2+.024},west?1:-1,0,dynamic());
    assert.ok(west?position.x<x:position.x>x1,item.id);
  }
});

test('一层餐厨从北端入口进入，原两门洞封实，餐厨之间可通行',()=>{
  route([[11.3,15.35],[12.3,14.6],[12.3,12.3]],{x:10.2,y:15.35,z:.024});
  for(const y of [11.6,14.15]) {
    const blocked=world.move({x:10.35,y,z:.024},.9,0,dynamic());
    assert.ok(blocked.x<10.7,`原门洞 ${y} 仍可穿过`);
  }
  const dining=plans[0].spaces.find(s=>s.id==='dining');
  const table=interiorLayout(p,plans[0]).items.find(i=>i.id==='dining-table');
  assert.ok(Math.abs(dining.clear_bounds_mm[2]/1000-table.bounds[2]-.025)<1e-6);
});

test('两层活动构件具有唯一编号，房门完整回转不碰固定家具',()=>{
  assert.equal(new Set(motions.map(m=>m.data.id)).size,motions.length);
  for(const m of motions.filter(m=>m.data.opening_id)) {
    for(let t=.05;t<=1.001;t+=.05){poseMotion(m,t);const candidate=motionObstacle(m),hit=world.obstacles.find(o=>overlap(candidate,o));assert.ok(!hit,`${m.data.id} 在 ${(t*90).toFixed(0)}° 碰 ${hit?.owner}`);}
    poseMotion(m,0);
  }
});

test('抽屉向柜外移动，关闭后精确复位；柜门开启露出柜内',()=>{
  const drawer=motions.find(m=>m.data.owner==='master-nightstand'),before=drawer.node.position.clone();
  poseMotion(drawer,1);assert.ok(Math.abs(drawer.node.position.z-before.z-.32)<1e-6);poseMotion(drawer,0);assert.ok(drawer.node.position.equals(before));
  const door=motions.find(m=>m.data.owner==='master-wardrobe/cabinet-0');
  poseMotion(door,1);const polygon=motionObstacle(door).polygon;assert.ok(Math.min(...polygon.map(p=>p[0]))<2.9);poseMotion(door,0);
});

test('静止门柜复用碰撞体，开合和楼层位移后更新缓存',()=>{
  const m=motions.find(m=>m.data.owner==='master-nightstand'),closed=motionObstacle(m);
  assert.equal(motionObstacle(m),closed);
  poseMotion(m,.5);const opened=motionObstacle(m);assert.notEqual(opened,closed);
  assert.notDeepEqual(opened.polygon,closed.polygon);
  const parent=m.node.parent,y=parent.position.y;
  parent.position.y+=5.4;const raised=motionObstacle(m);
  assert.ok(Math.abs(raised.bottom-opened.bottom-5.4)<1e-8);
  parent.position.y=y;poseMotion(m,0);
  assert.deepEqual(motionObstacle(m).polygon,closed.polygon);
  assert.equal(motionObstacle(m).bottom,closed.bottom);
});

test('柜门与抽屉逐个打开不碰相邻闭合门板和其他柜体',()=>{
  for(const m of motions.filter(m=>!m.data.opening_id)) {
    for(let t=.04;t<=1.001;t+=.04) {
      poseMotion(m,t);const candidate=motionObstacle(m);
      const hit=world.obstacles.find(o=>o.owner!==candidate.owner&&overlap(candidate,o))||motions.find(other=>other!==m&&overlap(candidate,motionObstacle(other)));
      assert.ok(!hit,`${m.data.id} 开到 ${t.toFixed(2)} 时碰 ${hit?.owner||hit?.data.id}`);
    }
    poseMotion(m,0);
  }
});

test('GLB 回读保留活动节点及铰轴位置，开合与浏览器源几何一致',async()=>{
  const bytes=readFileSync(new URL('../output/house.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const imported=collectMotions(new Map([1,2].map(level=>[level,scene.getObjectByName(`Floor_${level}`)])));
  assert.equal(imported.length,motions.length);
  for(const m of imported) {
    const source=motions.find(s=>s.data.id===m.data.id);assert.ok(source);
    for(const t of [0,1]) {
      poseMotion(m,t);poseMotion(source,t);
      const a=motionObstacle(m),b=motionObstacle(source);
      for(let i=0;i<4;i++)for(let j=0;j<2;j++)assert.ok(Math.abs(a.polygon[i][j]-b.polygon[i][j])<1e-5,m.data.id);
      assert.ok(Math.abs(a.bottom-b.bottom)<1e-5);assert.ok(Math.abs(a.top-b.top)<1e-5);
    }
    poseMotion(m,0);poseMotion(source,0);
  }
});
