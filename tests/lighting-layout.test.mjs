import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interiorLayout} from '../viewer/interior-layout.js';
import {lightingLayout,LIGHTING_SCENES} from '../viewer/lighting-layout.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];

test('42 处观看光源对应灯具，两层餐厨有任务照明，未定用途小间不布灯',()=>{
  const all=[];
  for(const plan of plans) {
    const layout=interiorLayout(p,plan),lights=lightingLayout(layout);all.push(...lights);
    for(const light of lights) {
      const room=layout.rooms.find(r=>r.id===light.space),[x,y,h]=light.position;
      assert.ok(room);assert.ok(x>room.bounds[0]&&x<room.bounds[2]&&y>room.bounds[1]&&y<room.bounds[3]);
      assert.ok(h>0&&h<p.wall_height/1000);assert.equal(light.status,'preview_photometry_pending');
      assert.ok(light.source==='existing_ceiling_fixture'?layout.lights.some(l=>l.space===light.space):layout.items.some(i=>i.id===light.source));
      assert.ok(!['north-small','east-small'].includes(light.space));
    }
  }
  assert.equal(all.length,42);assert.equal(new Set(all.map(l=>l.id)).size,42);
  assert.equal(all.filter(l=>l.group==='ceiling').length,22);
  assert.equal(all.filter(l=>l.name==='床头灯').length,8);
  assert.equal(all.filter(l=>l.name==='镜前灯').length,4);
});

test('日间关闭人工灯，休息场景降低顶灯，局部任务灯仍可分控',()=>{
  assert.equal(LIGHTING_SCENES.day.night,false);assert.equal(LIGHTING_SCENES.day.ceiling+LIGHTING_SCENES.day.local,0);
  assert.ok(LIGHTING_SCENES.rest.ceiling<LIGHTING_SCENES.rest.local);
  assert.ok(LIGHTING_SCENES.task.local>LIGHTING_SCENES.daily.local);
});
