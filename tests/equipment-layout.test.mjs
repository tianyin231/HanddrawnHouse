import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {equipmentLayout,serviceSystems} from '../viewer/equipment-layout.js';
import {interiorLayout} from '../viewer/interior-layout.js';
import {createInteriorDesign} from '../viewer/interior-design.js';
import {blueprintSVG} from '../viewer/blueprint.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];

test('14 处设备候选在房内，避开门窗投影，未定小间不布置设备',()=>{
  const items=[];
  for(const plan of plans) {
    const data=equipmentLayout(p,plan);items.push(...data.items);
    for(const item of data.items) {
      const b=item.bounds,r=plan.spaces.find(r=>r.id===item.space).clear_bounds_mm.map(v=>v/1000);
      assert.ok(b[0]>=r[0]&&b[1]>=r[1]&&b[2]<=r[2]&&b[3]<=r[3],item.id);
      assert.ok(item.bottom>2.3&&item.bottom+item.height<p.wall_height/1000-.025);
      assert.ok(!['north-small','east-small','annex-south','annex-north'].includes(item.space));
      if(item.type==='extract-fan') {
        const light=interiorLayout(p,plan).lights.find(l=>l.space===item.space);
        const dx=Math.max(b[0]-light.position[0],0,light.position[0]-b[2]);
        const dy=Math.max(b[1]-light.position[1],0,light.position[1]-b[3]);
        assert.ok(Math.hypot(dx,dy)>.30,`${item.id} 太靠近顶灯，不利于安装检修`);
      }
      if(item.type!=='air-conditioner')continue;
      for(const o of plan.openings) {
        const w=plan.walls.find(w=>w.id===o.wall_id),vertical=w.a[0]===w.b[0];
        if(vertical!==['west','east'].includes(item.wall))continue;
        const distance=Math.abs((vertical?(b[0]+b[2])/2:(b[1]+b[3])/2)-(vertical?w.a[0]:w.a[1])/1000);
        if(distance>.35)continue;
        const a=((vertical?w.a[1]:w.a[0])+o.offset)/1000,z=a+o.width/1000;
        const crosses=(vertical?b[3]:b[2])>a-.045&&(vertical?b[1]:b[0])<z+.045&&item.bottom<(o.head/1000+.045)&&item.bottom+item.height>(o.sill||0)/1000;
        assert.equal(crosses,false,`${item.id} 占用了 ${o.id} 的窗框/门框范围`);
      }
    }
    assert.deepEqual(data.outdoor_units,[]);assert.deepEqual(data.penetrations,[]);
  }
  assert.equal(items.filter(v=>v.type==='air-conditioner').length,10);
  assert.equal(items.filter(v=>v.type==='extract-fan').length,4);
  assert.equal(new Set(items.map(v=>v.id)).size,14);
});

test('设备检修候选区不被当前家具实体占用，卫浴虚线不越出房间',()=>{
  for(const plan of plans) {
    const group=createInteriorDesign(p,plan),objects=[];group.traverse(o=>{if(o.isMesh&&o.userData.interior_kind==='furniture')objects.push(o);});
    const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,2.55);
    for(const item of equipmentLayout(p,plan).items) {
      const [x,y,x1,y1]=item.serviceBounds;
      for(let a=x+.03;a<x1-.02;a+=.06)for(let q=y+.03;q<y1-.02;q+=.06) {
        ray.ray.origin.set(a,2.6,-q);
        assert.equal(ray.intersectObjects(objects,false).length,0,`${item.id} 检修区域有家具：${a.toFixed(2)}, ${q.toFixed(2)}`);
      }
      const r=plan.spaces.find(r=>r.id===item.space).clear_bounds_mm.map(v=>v/1000);
      for(const [a,q,h] of item.route||[])assert.ok(a>r[0]&&q>r[1]&&a<r[2]&&q<r[3]&&h<2.975);
    }
  }
});

test('设备图和连接关系保留未接通状态，导出不冒充已定主管与容量',()=>{
  for(const plan of plans) {
    const layout=interiorLayout(p,plan),data=equipmentLayout(p,plan,layout);
    for(const system of serviceSystems(layout,data)) {
      assert.equal(system.status,'interfaces_pending');assert.equal(system.sizing,null);assert.deepEqual(system.routes,[]);
      assert.ok(system.source===null||system.outlet===null);
    }
    for(const room of plan.spaces.filter(s=>s.id!=='courtyard')) {
      const svg=blueprintSVG(p,plan,{selected:room.id,zoom:true,equipment:true,zones:true});
      assert.ok(!/NaN|undefined|Infinity/.test(svg));
      for(const item of data.items.filter(v=>v.space===room.id))assert.ok(svg.includes(`data-equipment="${item.id}"`));
    }
  }
});
