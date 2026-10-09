import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { roofEnvelope, roofIsVisible, createRoofConcept, ROOF_PROPOSAL, ROOF_MATERIALS } from '../viewer/roof-concept.js';
const p=JSON.parse(readFileSync(new URL('../house_parameters.json',import.meta.url),'utf8'));
const roof=roofEnvelope(p);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

test('四坡屋面包含实体搭接瓦、正斜脊、檐底和开口檐沟，仍标为待复核',()=>{
  assert.equal(roof.classification,'hipped_tiled_roof_proposal');
  assert.equal(roof.status,'needs_review');
  for(const id of ['south-deck','north-deck','east-deck','west-deck','ridge-cap','hip-cap','south-eave-soffit','south-gutter-bottom'])
    assert.ok(roof.components.some(c=>c.id===id),id);
  assert.ok(roof.components.filter(c=>c.id.startsWith('tile/')).length>1000);
  assert.ok(roof.positions.flat().every(Number.isFinite));
});

test('每个实体封闭、面朝外且体积为正，裁剪的边瓦没有零面积三角形',()=>{
  const edges=new Map();
  for(const part of roof.components) {
    const pts=roof.positions.slice(part.vertexStart,part.vertexStart+part.vertexCount);
    const center=pts.reduce((s,p)=>s.map((v,i)=>v+p[i]/pts.length),[0,0,0]);
    let volume=0;
    for(const face of roof.triangles.slice(part.triangleStart,part.triangleStart+part.triangleCount)) {
      const [a,b,c]=face.map(i=>roof.positions[i]),normal=cross(sub(b,a),sub(c,a));
      assert.ok(Math.hypot(...normal)>1e-10,part.id+' 零面积');
      assert.ok(dot(normal,sub(a,center))>1e-12,part.id+' 朝向错误');
      volume+=dot(sub(a,center),cross(sub(b,center),sub(c,center)))/6;
      for(let i=0;i<3;i++) {
        const a=face[i],b=face[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
        edges.set(key,[...(edges.get(key)||[]),a<b?1:-1]);
      }
    }
    assert.ok(volume>0,part.id+' 非正体积');
  }
  for(const adjacent of edges.values())assert.deepEqual(adjacent.slice().sort(),[-1,1]);
});

test('朝南出檐只进入自家院子，其余三面包含檐沟和脊瓦均不越界',()=>{
  for(const [x,,z] of roof.positions) {
    assert.ok(x>=-1e-7&&x<=p.site_width/1000+1e-7);
    assert.ok(-z>=roof.footprintMm[1]/1000-1e-7&&-z<=(p.house_depth+p.courtyard_depth)/1000+1e-7);
  }
  assert.ok(roof.footprintMm[1]<p.courtyard_depth);
  assert.ok(roof.footprintMm[1]>p.courtyard_depth-1000);
  assert.equal(roof.materials.length,roof.triangles.length);
  assert.ok(roof.materials.every(i=>Number.isInteger(i)&&i>=0&&i<ROOF_MATERIALS.length));
});

test('浏览器按材质合并绘制，檐沟内部留空，前院中央没有屋顶',()=>{
  const group=createRoofConcept(THREE,p);
  assert.equal(group.visible,false);
  assert.equal(group.userData.model_status,'needs_review');
  assert.ok(group.children[0].geometry.groups.length<=ROOF_MATERIALS.length);
  group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(p.site_width/2000,20,-p.courtyard_depth/2000),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObject(group,true).length,0);
  ray.ray.origin.z=-(p.courtyard_depth/1000-ROOF_PROPOSAL.southEaveMm/1000-.08);
  const hit=ray.intersectObject(group,true)[0];
  assert.ok(hit);
  const expected=p.wall_height/1000+ROOF_PROPOSAL.eaveHeightMm/1000-.20+(p.site_width/2000-.12)*ROOF_PROPOSAL.gutterFallPerM;
  assert.ok(Math.abs(hit.point.y-expected)<1e-5);
});

test('两个落水口是真洞口，四角没有横向封堵，北侧沟底高于院侧',()=>{
  const group=createRoofConcept(THREE,p);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  for(const outlet of roof.drainageOutlets) {
    const [x,y,h]=outlet.position;
    ray.ray.origin.set(x,20,-y);
    assert.equal(ray.intersectObject(group,true).length,0,'落水口被封死');
    ray.ray.origin.set(x,20,-(p.house_depth+p.courtyard_depth)/1000+.08);
    const north=ray.intersectObject(group,true)[0];
    assert.ok(north.point.y>h+.02,'北侧没有向院侧找坡');
  }
  assert.ok(roof.drainageStatus.includes('pending'));
});

test('整栋和院中视角保留屋顶，剖切与单层隐藏屋顶',()=>{
  for(const view of ['floor1','floor2','whole','exploded','courtyard'])for(const cut of [true,false])for(const enabled of [true,false])
    assert.equal(roofIsVisible({view,cut,roof:enabled}),['whole','courtyard'].includes(view)&&!cut&&enabled);
});

test('参数只读且可重新生成，不接受无效尺寸或改变前院挑空约束',()=>{
  const changed=Object.freeze({...p,site_width:15000,house_depth:14000,courtyard_depth:7500});
  const before=JSON.stringify(changed),result=roofEnvelope(changed);
  assert.equal(result.footprintMm[2],15000);assert.equal(result.footprintMm[3],21500);
  assert.equal(JSON.stringify(changed),before);
  for(const value of [null,NaN,Infinity,0,-1,'14700'])assert.throws(()=>roofEnvelope({...p,site_width:value}));
  assert.throws(()=>roofEnvelope({...p,units:'m'}));
  assert.throws(()=>roofEnvelope({...p,upper_front_area:'terrace'}));
});

test('Blender 从项目目录外导出的几何、材质与浏览器一致',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/export-roof.mjs',import.meta.url))],
    {cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',maxBuffer:10*1024*1024});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{...roof,proposal:ROOF_PROPOSAL,materialDefinitions:ROOF_MATERIALS});
});
