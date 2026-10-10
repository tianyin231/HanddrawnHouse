import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectedLightingRooms} from '../viewer/lighting-layout.js';
import {daylightPortals,LIGHT_PROFILES} from '../viewer/scene-lighting.js';
import {solarPosition} from '../viewer/solar-study.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];

test('敞开的厅餐厨保持同组，门扇分隔的卧室不被自动点亮',()=>{
  const lower=connectedLightingRooms(plans,'1:hall');
  assert.ok(lower.has('1:dining')&&lower.has('1:kitchen'));
  assert.deepEqual(lower,connectedLightingRooms(plans,'1:kitchen'));
  assert.ok(!lower.has('1:bedroom-ne')&&!lower.has('1:master-bedroom'));
  assert.deepEqual(connectedLightingRooms(plans,'2:hall'),connectedLightingRooms(plans,'2:north-living'));
  assert.equal(connectedLightingRooms(plans,'').size,0);
});

test('窗口补光来自实际洞口，位置、强度、距离均有效且照向房间内部',()=>{
  const portals=daylightPortals(p,plans);
  assert.equal(portals.length,plans.flatMap(plan=>plan.openings.filter(o=>o.kind==='window')).length);
  for(const portal of portals){
    assert.ok(portal.intensity>0&&Number.isFinite(portal.intensity));
    assert.ok(portal.distance>=5);
    const direction=portal.target.clone().sub(portal.position);
    assert.ok(direction.dot(portal.normal)<0,`${portal.id} 未朝室内`);
    assert.ok(portal.position.toArray().every(Number.isFinite));
  }
});

test('普通浏览的傍晚太阳位于西侧低空，夜间关闭太阳',()=>{
  const day=solarPosition('2026-09-23',LIGHT_PROFILES.day.hour,p.solar_location);
  const evening=solarPosition('2026-09-23',LIGHT_PROFILES.evening.hour,p.solar_location);
  assert.ok(day.altitude>35);
  assert.ok(evening.altitude>0&&evening.altitude<15);
  assert.ok(evening.direction.x<0);
  assert.equal(LIGHT_PROFILES.night.sun,0);
});
