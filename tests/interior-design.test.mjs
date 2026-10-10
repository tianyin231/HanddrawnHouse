import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createInteriorDesign,applyInteriorStyle} from '../viewer/interior-design.js';
import {interiorLayout} from '../viewer/interior-layout.js';

const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];
const before=JSON.stringify([p,plans]);
const designs=plans.map(plan=>createInteriorDesign(p,plan));

function checkUseZones(group,layout,base=0) {
  const objects=[];group.traverse(obj=>{if(obj.isMesh&&obj.userData.interior_kind==='furniture')objects.push(obj);});
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,2.55);
  for(const zone of layout.zones) {
    const [x,y,x1,y1]=zone.bounds;
    assert.ok(x1>x && y1>y,`${zone.id} 没有有效面积`);
    for(let a=x+.04;a<x1-.03;a+=.10)for(let q=y+.04;q<y1-.03;q+=.10) {
      ray.ray.origin.set(a,base+2.60,-q);
      assert.equal(ray.intersectObjects(objects,false).length,0,`${zone.id} 的 ${a.toFixed(2)}, ${q.toFixed(2)} 被家具占用`);
    }
  }
}

test('室内布置保持原户型、院子挑空和用途未定的小间',()=>{
  assert.equal(JSON.stringify([p,plans]),before);
  for(const [i,group] of designs.entries()) {
    const bounds=new THREE.Box3().setFromObject(group),layout=interiorLayout(p,plans[i]);
    assert.ok(bounds.min.x>=-1e-6&&bounds.max.x<=p.site_width/1000+1e-6);
    assert.ok(bounds.min.z>=-20-1e-6&&bounds.max.z<=-7+1e-6);
    assert.ok(bounds.max.y<=p.wall_height/1000+1e-6);
    assert.ok(layout.items.every(item=>!['north-small','east-small'].includes(item.space)));
    assert.equal(layout.items.filter(item=>item.type==='bed').length,4);
    assert.equal(layout.items.filter(item=>item.type==='toilet').length,2);
  }
});

test('两层家具不侵入入门、柜前、椅后和卫浴使用范围',()=>{
  designs.forEach((group,i)=>checkUseZones(group,interiorLayout(p,plans[i])));
});

test('厨房水槽有下沉盆底，台面没有封住水槽洞',()=>{
  const objects=designs[0].children.filter(obj=>obj.userData.interior_room==='kitchen'&&obj.userData.interior_kind==='furniture');
  const ray=new THREE.Raycaster(new THREE.Vector3(14.13,2.5,-11.59),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObjects(objects,false)[0];
  assert.ok(hit&&hit.point.y<.70&&hit.point.y>.62);
  ray.ray.origin.set(13.87,2.5,-10.99);
  assert.ok(Math.abs(ray.intersectObjects(objects,false)[0].point.y-.855)<1e-5);
});

test('切换室内配色保留家具几何与通道，不重复添加模型',()=>{
  const group=designs[1],children=[...group.children],color=children.find(o=>o.userData.interior_material==='wood').material.color.getHex();
  applyInteriorStyle(group,2,'b');
  assert.deepEqual(group.children,children);
  assert.notEqual(children.find(o=>o.userData.interior_material==='wood').material.color.getHex(),color);
  applyInteriorStyle(group,2,'a');
});

test('GLB 包含两层完整室内方案，回读后使用范围仍畅通',async()=>{
  const bytes=readFileSync(new URL('../output/house.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const count=root=>{let n=0;root.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return n;};
  for(const plan of plans) {
    const root=gltf.scene.getObjectByName(`InteriorDesign_${plan.level}`);
    assert.ok(root,'请重建下载模型');
    assert.equal(root.parent.name,`Floor_${plan.level}`);
    assert.equal(root.userData.model_status,'needs_review');
    assert.equal(root.userData.interior_style,'a');
    assert.equal(count(root),count(designs[plan.level-1]));
    checkUseZones(root,interiorLayout(p,plan),(plan.level-1)*p.floor_to_floor/1000);
  }
});
