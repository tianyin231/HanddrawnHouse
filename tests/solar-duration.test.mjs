import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {windowSamples,solarPosition,prepareSunBlockers,directSunSamples} from '../viewer/solar-study.js';
import {dailySunStudy,summarizeSunBins,minuteLabel} from '../viewer/solar-duration.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')],targets=windowSamples(p,plans);

test('30 扇窗样点按房间内外侧定位，四向法线与楼层标高正确',()=>{
  assert.equal(targets.length,30);assert.equal(new Set(targets.map(t=>t.id)).size,30);
  assert.equal(new Set(targets.map(t=>t.label)).size,30);
  for(const target of targets) {
    assert.equal(target.points.length,9);assert.equal(target.normal.length(),1);
    const plan=plans[target.level-1],opening=plan.openings.find(o=>o.id===target.opening_id),wall=plan.walls.find(w=>w.id===opening.wall_id);
    const midpoint=target.points[4],axis=new THREE.Vector3(wall.a[0]/1000,midpoint.y,-wall.a[1]/1000);
    assert.ok(Math.abs(midpoint.clone().sub(axis).dot(target.normal)-wall.thickness/2000-.03)<1e-10);
    assert.ok(Math.abs(midpoint.y-((target.level-1)*p.floor_to_floor+(opening.sill+opening.head)/2)/1000)<1e-10);
    if(target.face==='北')assert.equal(target.normal.z,-1);
    if(target.face==='南')assert.equal(target.normal.z,1);
    if(target.face==='东')assert.equal(target.normal.x,1);
    if(target.face==='西')assert.equal(target.normal.x,-1);
  }
});

test('中心点、九点平均和最长连续分别统计，遮挡断档不能合并',()=>{
  const result=summarizeSunBins([
    {start:0,end:10,direct:9,total:9,center:true},
    {start:10,end:20,direct:9,total:9,center:true},
    {start:20,end:30,direct:8,total:9,center:false},
    {start:30,end:40,direct:1,total:9,center:true}
  ]);
  assert.equal(result.centerMinutes,30);assert.equal(result.meanMinutes,30);assert.equal(result.longestMinutes,20);
  assert.deepEqual(result.intervals,[{start:0,end:20},{start:30,end:40}]);
  assert.equal(minuteLabel(720),'12:00');assert.equal(minuteLabel(1435),'23:55');assert.equal(minuteLabel(1440),'24:00');
});

test('射线加速保留变换后的真实实体遮挡，并固定计算时的矩阵',()=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(4,4,1),new THREE.MeshBasicMaterial());
  mesh.position.set(1,2,2);mesh.rotation.y=.3;mesh.updateMatrixWorld(true);
  const target={points:[new THREE.Vector3(1,1,0)],normal:new THREE.Vector3(0,0,1)};
  const sun={altitude:45,direction:new THREE.Vector3(0,1,1).normalize()},blocked=prepareSunBlockers([mesh]);
  assert.equal(directSunSamples([target],sun,blocked)[0].direct,0);
  mesh.position.x=20;mesh.updateMatrixWorld(true);
  assert.equal(directSunSamples([target],sun,blocked)[0].direct,0);
  assert.equal(directSunSamples([target],sun,[mesh])[0].direct,1);
});

test('全天开放天空计算保留夜晚零值，冬季北窗不被误算为南窗',async()=>{
  const picked=['1:south-master','1:north-middle-1'].map(id=>targets.find(t=>t.id===id));
  const report=await dailySunStudy({date:'2026-12-22',location:p.solar_location,targets:picked,objects:[],conditions:{site_status:'not_surveyed'},yieldTask:async()=>{}});
  assert.equal(report.status,'scenario_not_surveyed');assert.equal(report.engineering_acceptance,'not_assessed');
  const [south,north]=report.windows;
  assert.equal(south.bins.length,144);assert.equal(south.bins[0].direct,0);assert.equal(south.bins.at(-1).direct,0);
  assert.ok(south.centerMinutes>=550&&south.centerMinutes<=590);
  assert.equal(south.centerMinutes,south.meanMinutes);assert.equal(south.longestMinutes,south.centerMinutes);
  assert.equal(north.centerMinutes,0);assert.equal(north.meanMinutes,0);
  assert.equal(south.bins.find(b=>b.start===720).sampled_at,725);
});

test('北向偏角会改变窗面迎光时段，日期切换会改变日长',async()=>{
  const target=targets.find(t=>t.id==='1:north-middle-1');
  const run=(date,rotation)=>dailySunStudy({date,location:{...p.solar_location,north_rotation_deg:rotation},targets:[target],objects:[],conditions:{},yieldTask:async()=>{}});
  assert.ok((await run('2026-12-22',180)).windows[0].centerMinutes>500);
  assert.ok((await run('2026-06-21',0)).windows[0].centerMinutes>0);
});

test('取消全天计算不返回残缺报告，计算期间定期让出线程',async()=>{
  const controller=new AbortController();let yields=0;
  await assert.rejects(dailySunStudy({date:'2026-12-22',location:p.solar_location,targets:targets.slice(0,1),objects:[],conditions:{},signal:controller.signal,
    yieldTask:async()=>{yields++;controller.abort();}}),{name:'AbortError'});
  assert.equal(yields,1);
});
