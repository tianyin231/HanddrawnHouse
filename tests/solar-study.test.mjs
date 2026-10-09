import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {solarPosition, neighborLayout, directSunSamples} from '../viewer/solar-study.js';
import {siteLayout, yardElevationAt} from '../viewer/site-layout.js';

const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json');

test('邯郸太阳在上午偏东、下午偏西，冬季正午低于夏季',()=>{
  const winter=solarPosition('2026-12-22',12.35,p.solar_location);
  const summer=solarPosition('2026-06-21',12.4,p.solar_location);
  assert.ok(winter.altitude>29 && winter.altitude<31);
  assert.ok(summer.altitude>76 && summer.altitude<78);
  assert.ok(Math.abs(winter.azimuth-180)<2);
  assert.ok(solarPosition('2026-06-21',9,p.solar_location).direction.x>0);
  assert.ok(solarPosition('2026-06-21',16,p.solar_location).direction.x<0);
  assert.ok(solarPosition('2026-06-21',0,p.solar_location).altitude<0);
  const rotated=solarPosition('2026-12-22',12.35,{...p.solar_location,north_rotation_deg:90});
  assert.ok(rotated.direction.x>.85 && Math.abs(rotated.direction.z)<.03);
  assert.ok(Math.abs(rotated.direction.length()-1)<1e-12);
});

test('邻房保留已确认的南北间隔和东侧空地，高度可调整',()=>{
  const [north,south,east]=neighborLayout(p,{north:2,south:4,east:8});
  assert.equal(north.bounds[1],20.25);
  assert.equal(south.bounds[3],-.25);
  assert.equal(east.bounds[0],17.7);
  assert.equal(east.height,8);
});

test('窗外直射样点会被前方体块遮住，夜晚或背向太阳不计直射',()=>{
  const target={label:'南窗',points:[new THREE.Vector3(0,1,0)],normal:new THREE.Vector3(0,0,1)};
  const solar={altitude:45,direction:new THREE.Vector3(0,1,1).normalize()};
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,4,1),new THREE.MeshBasicMaterial());
  mesh.position.set(0,2,2);mesh.updateMatrixWorld(true);
  assert.equal(directSunSamples([target],solar,[])[0].direct,1);
  assert.equal(directSunSamples([target],solar,[mesh])[0].direct,0);
  assert.equal(directSunSamples([target],{...solar,altitude:-5},[])[0].direct,0);
  assert.equal(directSunSamples([target],{...solar,direction:new THREE.Vector3(0,1,-1).normalize()},[])[0].direct,0);
});

test('找坡不改变第一级台阶高度，门廊柱避开入户梯与楼梯口',()=>{
  const plan=read('plan_floor_1.json'), site=siteLayout(p,plan);
  const first=(p.courtyard_depth-p.entrance_proposal.landing_outside_mm-2*p.entrance_proposal.tread_mm)/1000;
  assert.equal(yardElevationAt(p,first),-.45);
  assert.ok(yardElevationAt(p,1.45)<yardElevationAt(p,0));
  assert.ok(yardElevationAt(p,1.45)<yardElevationAt(p,7));
  const left=(p.entrance_proposal.center_x_mm-p.entrance_proposal.width_mm/2)/1000;
  const right=(p.entrance_proposal.center_x_mm+p.entrance_proposal.width_mm/2)/1000;
  for(const x of site.columns)assert.ok(x+site.columnWidth/2<left || x-site.columnWidth/2>right);
  assert.ok(site.columns[1]+site.columnWidth/2<plan.stairs.entry_x/1000);
});
