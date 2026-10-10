import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {designReview} from '../viewer/design-review-data.js';
import {blueprintSVG} from '../viewer/blueprint.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];
const report=designReview(p,plans);

test('饰面让开门窗洞，踢脚线不跨门槛，卫浴东墙保留门洞',()=>{
  for(const floor of report.floors)for(const piece of floor.finishes.pieces) {
    const face=floor.finishes.faces.find(f=>f.room===piece.room&&f.wall===piece.wall);
    const [x,y,x1,y1]=piece.bounds,[a,b]=face.horizontal?[x,x1]:[y,y1];
    assert.ok([a,b,piece.z,piece.height].every(Number.isFinite));
    assert.ok(b>a&&piece.height>0);
    for(const hole of face.holes) {
      const crosses=b>hole.a+1e-6&&a<hole.b-1e-6&&piece.z<hole.head-1e-6&&piece.z+piece.height>hole.sill+1e-6;
      assert.equal(crosses,false,`${piece.id} 封住 ${hole.id}`);
    }
  }
  assert.ok(report.floors.every(f=>f.finishes.pieces.some(v=>v.id.endsWith('/tile-east'))));
  for(const floor of report.floors)for(const tile of floor.finishes.pieces.filter(v=>v.id.endsWith('/tile-east'))) {
    const trims=floor.finishes.pieces.filter(v=>v.room===tile.room&&v.wall===tile.wall&&v.id.includes('/trim/'));
    for(const trim of trims){const a=tile.bounds,b=trim.bounds;
      const overlaps=Math.min(a[2],b[2])-Math.max(a[0],b[0])>1e-6&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>1e-6&&Math.min(tile.z+tile.height,trim.z+trim.height)-Math.max(tile.z,trim.z)>1e-6;
      assert.equal(overlaps,false,`${tile.id} 与门套重叠`);
    }
  }
});

test('方案用量不统计挑空、楼梯和附属间，不冒充采购或现场验收',()=>{
  assert.equal(report.procurement_ready,false);assert.equal(report.engineering_acceptance,'not_assessed');
  for(const floor of report.floors) {
    assert.ok(floor.rooms.every(r=>!['courtyard','stairwell','porch','annex-north','annex-south'].includes(r.id)));
    assert.ok(floor.quantities.floorArea>130&&floor.quantities.floorArea<140);
    const master=floor.rooms.find(r=>r.id==='master-bedroom');
    assert.ok(Math.abs(master.area-3.67*4.17)<1e-6);
    assert.ok(master.skirting>0&&master.skirting<2*(3.67+4.17));
    assert.ok(floor.rooms.flatMap(r=>r.services).every(s=>s.status==='candidate_not_measured'));
  }
  const changed=structuredClone(plans);changed[0].spaces.find(r=>r.id==='master-bedroom').clear_bounds_mm[2]-=100;
  const adjusted=designReview(p,changed).floors[0].quantities.floorArea;
  assert.ok(Math.abs(report.floors[0].quantities.floorArea-adjusted-.417)<1e-6,'用量应随源尺寸变化');
});

test('两层尺寸图及各房间放大图都可离线导出，保留方案标记和真实尺寸',()=>{
  for(const plan of plans)for(const room of plan.spaces.filter(s=>s.id!=='courtyard'))for(const furnished of [true,false]) {
    const svg=blueprintSVG(p,plan,{furnished,selected:room.id,zoom:true,services:true});
    assert.ok(!/NaN|undefined|Infinity/.test(svg),`${plan.level}/${room.id}`);
    assert.ok(svg.includes(String(room.clear_bounds_mm[2]-room.clear_bounds_mm[0])));
    assert.ok(svg.includes('非施工图'));
    assert.ok(!svg.includes('<script')&&!svg.includes('href='));
  }
});
