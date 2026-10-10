import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {roofEnvelope} from '../viewer/roof-concept.js';
import {buildingDetails} from '../viewer/building-details.js';
import {buildingDetailSVG} from '../viewer/building-detail-svg.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plan=read('plan_floor_1.json'),report=buildingDetails(p,plan);

test('屋面坡度取自同一套几何；变更屋深后仍与实体吻合',()=>{
  for(const parameters of [p,{...p,house_depth:p.house_depth+400}]) {
    const roof=roofEnvelope(parameters),south=roof.components.find(c=>c.id==='south-deck');
    const top=roof.positions.slice(south.vertexStart+south.vertexCount/2,south.vertexStart+south.vertexCount);
    const low=top.reduce((a,b)=>a[1]<b[1]?a:b),high=top.reduce((a,b)=>a[1]>b[1]?a:b);
    const actual=(high[1]-low[1])/Math.abs(high[2]-low[2]);
    assert.ok(Math.abs(actual-buildingDetails(parameters,plan).metrics.roof.pitchRatio)<1e-9);
  }
  assert.equal(report.metrics.roof.product,null);assert.equal(report.metrics.roof.compatibility,'not_verified');
});

test('附属间压顶余量与下载模型坡面一致，防水层和溢流没有假定为已定',async()=>{
  const bytes=readFileSync(new URL('../output/house.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);const garden=scene.getObjectByName('CourtyardDesign');
  const base=-p.entrance_proposal.yard_drop_mm/1000;
  for(const item of report.metrics.annex.clearances) {
    const [x,y]=item.position;
    const ray=new THREE.Raycaster(new THREE.Vector3(x,report.metrics.annex.capBottom+base-.001,-y),new THREE.Vector3(0,-1,0),0,.4);
    const hit=ray.intersectObject(garden,true)[0];assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-base-item.roof)<1e-5,'模型坡面与余量计算不一致');
  }
  assert.equal(report.metrics.annex.membraneThicknessMm,null);assert.equal(report.metrics.annex.overflow,null);assert.equal(report.metrics.annex.outfall,null);
});

test('节点独立导出带有示意边界，关闭候选层不会伪装为已建成',()=>{
  assert.equal(report.status,'candidate_not_engineered');assert.equal(report.procurement_ready,false);
  for(const item of report.items) {
    const svg=buildingDetailSVG(item),base=buildingDetailSVG(item,false);
    assert.match(svg,/不按比例/);assert.match(svg,/未写入建筑实体/);assert.match(svg,/data-candidate="true"/);
    assert.match(base,/<g data-candidate="false"><\/g>/);
    assert.ok(item.sources.every(id=>report.sources.some(s=>s.id===id)));
  }
});
