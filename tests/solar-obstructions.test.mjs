import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {centerSunDiagnostic,prepareSunBlockers} from '../viewer/solar-study.js';
import {summarizeObstructions,sunBlockerInfo} from '../viewer/solar-obstructions.js';

const target={points:[new THREE.Vector3(0,1,0)],normal:new THREE.Vector3(0,0,1)};
const solar={altitude:30,direction:new THREE.Vector3(0,0,1)};
function obstacle(name,z,parentName='Floor_2') {
  const parent=new THREE.Group();parent.name=parentName;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,4,.2),new THREE.MeshBasicMaterial());
  mesh.name=name.replaceAll('/','');mesh.userData.name=name;mesh.position.set(0,1,z);parent.add(mesh);parent.updateMatrixWorld(true);return mesh;
}

test('最近遮挡按射线距离确定，不受对象遍历顺序影响，后方重叠遮挡仍保留',()=>{
  const slab=obstacle('F2/floor/property-boundary',2),neighbor=obstacle('east',4,'NeighborStudy');
  const blocked=prepareSunBlockers([neighbor,slab]),result=centerSunDiagnostic(target,solar,blocked);
  assert.equal(result.state,'blocked');assert.equal(result.hit.group,'slab');
  assert.ok(Math.abs(result.hit.distance-1.9)<1e-6);
  assert.deepEqual(result.groups,['neighbor-east','slab']);
  const summary=summarizeObstructions([{start:0,end:10,sampled_at:5,center_diagnostic:result}]);
  assert.equal(summary.groups[0].nearestMinutes,10);
  assert.equal(summary.groups[0].withoutGroupGainMinutes,0,'忽略近处楼板后仍有邻房，不能增加直射');
  assert.equal(slab.position.z,2,'诊断不得修改模型');
});

test('同类多个构件只计一次，参照收益与夜晚、背光严格分开',()=>{
  const a=obstacle('F1/stair/flight-1',2,'Floor_1'),b=obstacle('F1/stair/flight-2',3,'Floor_1');
  const blocked=prepareSunBlockers([a,b]),center=centerSunDiagnostic(target,solar,blocked);
  const bins=[
    {start:0,end:10,sampled_at:5,center_diagnostic:center},
    {start:10,end:20,sampled_at:15,center_diagnostic:centerSunDiagnostic(target,{...solar,altitude:-1},blocked)},
    {start:20,end:30,sampled_at:25,center_diagnostic:centerSunDiagnostic(target,{...solar,direction:solar.direction.clone().negate()},blocked)},
    {start:30,end:40,sampled_at:35,center_diagnostic:centerSunDiagnostic(target,solar,prepareSunBlockers([]))}
  ];
  const result=summarizeObstructions(bins);
  assert.equal(result.nightMinutes,10);assert.equal(result.backFacingMinutes,10);assert.equal(result.blockedMinutes,10);
  assert.equal(result.groups.length,1);assert.equal(result.groups[0].withoutGroupGainMinutes,10);
  assert.equal(bins[3].center_diagnostic.state,'direct');
});

test('屋面、梁柱和植物按模型分组识别，门窗框不归入墙体',()=>{
  const roof=obstacle('roof-assembly',2,'RoofConcept');assert.equal(sunBlockerInfo(roof).group,'roof');
  const porch=obstacle('porch/structure',2,'StructureProposal_1');assert.equal(sunBlockerInfo(porch).group,'porch');
  porch.parent.userData.name='F1/StructureProposal_1';porch.parent.name='F1StructureProposal_1';assert.equal(sunBlockerInfo(porch).group,'porch');
  const leaf=obstacle('leaf',2,'CourtyardDesign');leaf.userData.garden_material='leaf';assert.equal(sunBlockerInfo(leaf).group,'vegetation');
  const frame=obstacle('F1/opening/window/head',2);Object.assign(frame.userData,{opening_kind:'window',wall_id:'hall-front'});
  assert.equal(sunBlockerInfo(frame).group,'openings');
});
