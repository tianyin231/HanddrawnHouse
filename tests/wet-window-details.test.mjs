import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {interiorLayout} from '../viewer/interior-layout.js';
import {createInteriorDesign} from '../viewer/interior-design.js';
import {wetAreaDetails} from '../viewer/wet-area-details.js';
import {windowDetails} from '../viewer/window-details.js';
import {designReview} from '../viewer/design-review-data.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];
const bytes=readFileSync(new URL('../output/house.glb',import.meta.url));
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.updateMatrixWorld(true);

test('四处地漏真实缝隙未被地砖填平，篦条齐平，结构楼板没有因此开孔',()=>{
  for(const plan of plans) {
    const layout=interiorLayout(p,plan),source=createInteriorDesign(p,plan),floor=scene.getObjectByName(`Floor_${plan.level}`),base=(plan.level-1)*p.floor_to_floor/1000;
    for(const wet of wetAreaDetails(layout,plan)) {
      const d=wet.drain,[x,y,x1,y1]=d.bounds,gap=(x1-x-2*d.frameWidth-d.barCount*d.barWidth)/(d.barCount+1);
      for(const [root,offset] of [[source,0],[floor,base]]) {
        const ray=new THREE.Raycaster(new THREE.Vector3(0,offset+.1,-(y+y1)/2),new THREE.Vector3(0,-1,0),0,.2);
        for(const [a,z] of [[x+d.frameWidth+gap/2,d.bottom+.001],[x+d.frameWidth+gap+d.barWidth/2,d.top]]) {
          ray.ray.origin.x=a;const hit=ray.intersectObject(root,true)[0];assert.ok(hit);
          assert.ok(Math.abs(hit.point.y-offset-z)<1e-5,`${plan.level}:${d.id} 缝隙或篦条高度不符`);
        }
      }
      const slabs=[];floor.traverse(o=>{if(o.isMesh&&/floorproperty.?boundary/.test(o.name))slabs.push(o);});assert.ok(slabs.length);
      const ray=new THREE.Raycaster(new THREE.Vector3(d.center[0],base+.1,-d.center[1]),new THREE.Vector3(0,-1,0));
      assert.ok(Math.abs(ray.intersectObjects(slabs)[0].point.y-base)<1e-5);
      for(const key of ['fall','recess','threshold','membrane','membraneThicknessMm'])assert.equal(wet[key],null);
    }
  }
});

test('南窗滴水槽在墙外真实露出，贴界窗保持边界且不冒充有外露槽',()=>{
  for(const plan of plans)for(const detail of windowDetails(p,plan)) {
    const floor=scene.getObjectByName(`Floor_${plan.level}`),base=(plan.level-1)*p.floor_to_floor/1000;
    const meshes=[];floor.traverse(o=>{if(o.isMesh&&o.userData.opening_id===detail.id&&/^exterior\/sill-stone(?:\.\d+)?$/.test(o.material.name))meshes.push(o);});
    assert.equal(meshes.length,1,`${plan.level}:${detail.id} 窗台实体缺失或重复`);const stored=JSON.parse(meshes[0].userData.sill_detail);
    assert.deepEqual(stored,JSON.parse(JSON.stringify(detail)));
    const [inside,upper]=detail.section[0],[outside,lower]=detail.section[1];
    assert.ok(upper>lower&&outside>inside);
    if(!detail.drip){assert.equal(detail.projectionMm,0);assert.equal(detail.section.length,4);continue;}
    const sill=upper-.006;
    for(const [depth,z] of [[outside-.0175,sill-.05],[outside-.005,sill-.06]]) {
      const x=detail.origin[0]+detail.along[0]*detail.width/2+detail.outward[0]*depth;
      const y=detail.origin[1]+detail.along[1]*detail.width/2+detail.outward[1]*depth;
      const ray=new THREE.Raycaster(new THREE.Vector3(x,base+sill-.09,-y),new THREE.Vector3(0,1,0),0,.12);
      const hit=ray.intersectObject(floor,true)[0];assert.ok(hit);
      assert.ok(Math.abs(hit.point.y-base-z)<1e-5,`${detail.id} 滴水槽被墙体或其他构件遮住`);
    }
  }
});

test('复核导出覆盖两层卫浴和全部窗台，节点仍保留选型与施工待定',()=>{
  const report=designReview(p,plans),details=report.building_details;
  assert.equal(details.metrics.wetAreas.length,4);assert.equal(details.metrics.windows.length,30);assert.equal(details.items.length,7);
  for(const w of details.metrics.windows){assert.equal(w.perimeterJoint,null);assert.equal(w.frameDrainage,null);}
  for(const f of report.floors)for(const r of f.rooms.filter(r=>r.id.startsWith('bathroom')))assert.ok(r.wetDetails);
  assert.equal(details.procurement_ready,false);
});
