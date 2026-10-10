import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {circulationLayout} from '../viewer/circulation-layout.js';
import {createCirculationDesign} from '../viewer/circulation-design.js';
import {interiorMaterials} from '../viewer/interior-design.js';

const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];

test('新增通行灯位于栏杆外侧，保留原有庭院灯和门灯，未锁定电气规格',()=>{
  const layouts=plans.map(plan=>circulationLayout(p,plan)),all=layouts.flatMap(l=>l.items.concat(l.existing));
  assert.equal(all.length,19);assert.equal(new Set(all.map(l=>l.id)).size,19);
  assert.equal(all.filter(l=>l.group==='garden').length,5);
  assert.equal(all.filter(l=>l.group==='porch').length,6);
  assert.equal(all.filter(l=>l.group==='path').length,8);
  const [,y0,,y1]=plans[0].stairs.bounds.map(v=>v/1000);
  for(const light of layouts.flatMap(l=>l.items)) {
    assert.equal(light.status,'preview_photometry_pending');assert.equal(light.watts,undefined);
    assert.ok(light.position[2]<light.bottom&&light.target[2]<light.position[2]);
    if(/stair-lower/.test(light.id))assert.ok(light.bounds[3]<y0);
    if(/stair-upper|:landing$/.test(light.id))assert.ok(light.bounds[1]>y1);
  }
});

test('下载模型保留通行灯具，中心光线越过栏杆并抵达踏面或地面',async()=>{
  const bytes=readFileSync(new URL('../output/house.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const triangles=root=>{let count=0;root.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return count;};
  for(const plan of plans) {
    const roots=scene.getObjectByName(`Floor_${plan.level}`).children.filter(child=>child.userData.circulation_lighting);
    assert.equal(roots.length,1,'每层只保留一份通行灯具');
    const root=roots[0],base=(plan.level-1)*p.floor_to_floor/1000;
    assert.ok(root,'请重建下载模型');assert.equal(root.parent.name,`Floor_${plan.level}`);
    assert.equal(triangles(root),triangles(createCirculationDesign(p,plan,interiorMaterials(plan.level,'a'))));
    for(const item of circulationLayout(p,plan).items) {
      const origin=new THREE.Vector3(item.position[0],base+item.position[2],-item.position[1]);
      const target=new THREE.Vector3(item.target[0],base+item.target[2],-item.target[1]);
      const ray=new THREE.Raycaster(origin,target.clone().sub(origin).normalize(),0,origin.distanceTo(target)+.08);
      const hit=ray.intersectObject(scene,true)[0];
      assert.ok(hit,`${item.id} 没有照向模型表面`);
      assert.ok(hit.point.distanceTo(target)<.05,`${item.id} 被 ${hit.object.name} 提前遮挡`);
    }
  }
});
