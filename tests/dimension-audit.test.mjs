import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {auditDimensions,expectedStair,MEASUREMENT_FIELDS,validateMeasurement,measurementComparison,parseMeasurementFile,toCSV} from '../viewer/dimension-audit.js';
const root=new URL('../',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const baseline={p:read('house_parameters.json'),plans:[read('plan_floor_1.json'),read('plan_floor_2.json')]};
function fixture(){return structuredClone(baseline);}
function check(mutator,code){const {p,plans}=fixture();mutator(p,plans);const report=auditDimensions(p,plans);assert.equal(report.data_status,'fail');assert.ok(report.issues.some(i=>i.code===code),JSON.stringify(report.issues));}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;}
const record=overrides=>({id:'site_width',value:14680,unit:'mm',basis:'outer',measured_at:'2026-10-09',recorder:'测量人',reference:'A—B，照片 0123',note:'尚未完成抹灰',baseline_value:14700,...overrides});

test('baseline contracts pass without claiming survey, geometry or construction acceptance',()=>{
  const before=JSON.stringify(baseline),report=auditDimensions(freeze(baseline.p),freeze(baseline.plans));
  assert.equal(report.data_status,'pass');assert.deepEqual(report.issues,[]);
  assert.equal(report.rooms.length,31);assert.equal(report.openings.length,50);assert.equal(report.measurements.length,42);
  assert.equal(report.model_status,'needs_review');assert.equal(report.engineering_acceptance,'not_assessed');
  assert.equal(report.binary_models_checked,false);assert.equal(report.field_measurements_verified,0);
  assert.ok(report.measurements.every(m=>m.field_verified===false));assert.equal(JSON.stringify(baseline),before);
});
test('master bedroom inclusive dimensions and estimate stay distinct',()=>{
  const report=auditDimensions(baseline.p,baseline.plans);
  for(const room of report.rooms.filter(r=>r.id==='master-bedroom')){
    assert.deepEqual(room.nominal_mm,[4000,4500]);assert.deepEqual(room.estimated_clear_mm,[3670,4170]);assert.equal(room.finished_clear_mm,null);
  }
});
test('stair formula agrees with both existing plan contracts',()=>{
  const expected=expectedStair(baseline.p);
  for(const plan of baseline.plans)for(const [key,value] of Object.entries(expected))assert.deepEqual(plan.stairs[key],value,key);
  assert.equal(expected.riser_height,160);assert.equal(expected.flight_clear_width,1110);
});
test('millimetres must be explicit',()=>check(p=>p.units='m','UNITS'));
test('missing numeric values, strings, NaN and Infinity are rejected',()=>{
  for(const value of [undefined,'14700',NaN,Infinity,0,-1])check(p=>p.site_width=value,'PARAMETER');
});
test('odd, fractional and insufficient stair counts cannot silently truncate',()=>{
  for(const count of [1,2,3,19,20.5])check(p=>p.stair_risers=count,'STAIR_COUNT');
});
test('zero gap and zero window offset are numerically allowed but stale plans are still rejected',()=>{
  const {p,plans}=fixture();p.stair_gap=0;p.kitchen_south_window.west_offset=0;
  const report=auditDimensions(p,plans);assert.ok(!report.issues.some(i=>i.code==='PARAMETER'));assert.ok(report.issues.some(i=>i.code==='STALE_STAIR'));
});
test('vertical stack does not permit hidden gaps',()=>check(p=>p.slab_thickness=180,'LEVEL_STACK'));
test('changing wall height and slab together still detects stale walls',()=>check(p=>{p.wall_height=3100;p.slab_thickness=100;},'STALE_WALL_HEIGHT'));
test('updated width detects an unreconstructed plan',()=>check(p=>p.site_width+=100,'STALE_BOUNDARY'));
test('updated bedroom allocation detects stale room data',()=>check(p=>p.master_bedroom_depth+=100,'STALE_ROOM_PARAMETER'));
test('updated exterior wall thickness detects stale walls',()=>check(p=>p.exterior_wall_thickness=300,'STALE_WALL'));
test('updated door height detects stale openings',()=>check(p=>p.door_height=2300,'STALE_DOOR_HEIGHT'));
test('incorrect number or duplicate floors is rejected',()=>{
  assert.equal(auditDimensions(baseline.p,[baseline.plans[0]]).data_status,'fail');
  assert.equal(auditDimensions(baseline.p,[baseline.plans[0],baseline.plans[0]]).data_status,'fail');
});
test('corrupt floor collections produce actionable errors, not crashes',()=>check((p,plans)=>plans[0].walls=null,'PLAN_SCHEMA'));
test('duplicate and null entities are rejected',()=>{
  check((p,plans)=>plans[0].walls.push({...plans[0].walls[0]}),'ENTITY_ID');
  check((p,plans)=>plans[0].walls.push(null),'ENTITY_ID');
});
test('invalid wall geometry is rejected',()=>check((p,plans)=>plans[0].walls[0].a=[null,0],'WALL_GEOMETRY'));
test('unsupported slanted walls cannot masquerade as rectangular clearance',()=>check((p,plans)=>plans[0].walls[0].b[0]+=10,'WALL_DIRECTION'));
test('an unknown opening host fails',()=>check((p,plans)=>plans[0].openings[0].wall_id='missing','OPENING_DATA'));
test('out-of-wall openings fail',()=>check((p,plans)=>plans[0].openings[0].width=99999,'OPENING_BOUNDS'));
test('window head and sill must agree with height',()=>check((p,plans)=>plans[0].openings.find(o=>o.kind==='window').height=1,'OPENING_HEIGHT'));
test('overlapping openings are detected on the same wall and elevation',()=>check((p,plans)=>plans[0].openings.push({...plans[0].openings[0],id:'overlap-copy'}),'OPENING_OVERLAP'));
test('same horizontal offset at a separate height is not a false overlap',()=>{
  const {p,plans}=fixture(),door=plans[0].openings.find(o=>o.id==='master-suite-entry-door');
  plans[0].openings.push({...door,id:'transom-test',kind:'window',sill:2300,head:2800});
  assert.equal(auditDimensions(p,plans).data_status,'pass');
});
test('cached clear size cannot hide a one millimetre mismatch',()=>check((p,plans)=>plans[0].spaces[0].clear_size_mm[0]+=1,'STALE_SPACE'));
test('non-rectangular or duplicate-vertex room is rejected',()=>check((p,plans)=>plans[0].spaces[0].polygon[1]=plans[0].spaces[0].polygon[0],'SPACE_GEOMETRY'));
test('stair formula change detects stale stair exports',()=>check(p=>p.stair_tread=290,'STALE_STAIR'));
test('main hall must not silently gain a stair connection',()=>check((p,plans)=>plans[0].connections.push({id:'illegal-shortcut',spaces:['hall','stairwell'],kind:'open',segment:[[0,0],[0,1]]}),'CONFIRMED_CIRCULATION'));
test('confirmed two-floor ensuite parameter remains protected',()=>check(p=>p.ensuite_floors=[1],'CONFIRMED_SUITE_PARAMETERS'));
test('removing suite access is caught',()=>check((p,plans)=>plans[1].connections=plans[1].connections.filter(c=>!c.spaces.includes('suite-passage')),'CONFIRMED_SUITE'));
test('courtyard void must remain present upstairs',()=>check((p,plans)=>plans[1].excluded_regions=[],'COURTYARD_VOID'));
test('kitchen south window must use current parameters',()=>check(p=>p.kitchen_south_window.width=2300,'STALE_KITCHEN_WINDOW'));
test('annex passage cannot shrink unnoticed',()=>check((p,plans)=>{const w=plans[0].walls.find(w=>w.id==='yard-screen');w.a[0]+=50;w.b[0]+=50;},'ANNEX_PASSAGE'));
test('measurement records require evidence, unit, real date and finite values',()=>{
  assert.equal(validateMeasurement(record()),null);
  for(const overrides of [{value:NaN},{value:Infinity},{value:'14000'},{unit:'m'},{basis:'unknown'},{measured_at:'2026-02-30'},{measured_at:'2026-13-01'},{recorder:' '},{reference:''},{baseline_value:'14700'},{note:null}])assert.ok(validateMeasurement(record(overrides)),JSON.stringify(overrides));
});
test('measurement count, angle, signed elevation and zero offset have distinct limits',()=>{
  assert.ok(validateMeasurement(record({id:'stair_risers',unit:'级',basis:'count',value:20.5})));
  assert.ok(validateMeasurement(record({id:'survey.north_azimuth',unit:'°',basis:'angle',value:360})));
  assert.equal(validateMeasurement(record({id:'survey.indoor_outdoor_level',basis:'elevation',value:-120,baseline_value:null})),null);
  assert.equal(validateMeasurement(record({id:'kitchen_south_window.west_offset',basis:'offset',value:0,baseline_value:900})),null);
});
test('incompatible dimension basis never produces a delta',()=>{
  const field={...MEASUREMENT_FIELDS[0],current:14700};
  assert.equal(measurementComparison(field,record({basis:'finished'})).state,'different_basis');
  assert.equal(measurementComparison(field,record({basis:'finished'})).delta,null);
});
test('changed model value marks old measurement stale, not approved',()=>{
  const result=measurementComparison({...MEASUREMENT_FIELDS[0],current:14800},record());
  assert.equal(result.state,'stale');assert.equal(result.delta,null);
});
test('matching basis exposes delta as a record, never as applied data',()=>{
  const result=measurementComparison({...MEASUREMENT_FIELDS[0],current:14700},record());
  assert.equal(result.state,'recorded');assert.equal(result.delta,-20);assert.equal(result.label,'已记录，未应用');
});
test('measurement JSON import validates the whole file and rejects duplicate or unknown IDs',()=>{
  const packet=records=>JSON.stringify({schema_version:1,records});
  assert.deepEqual(parseMeasurementFile(packet([record()])),[record()]);
  assert.throws(()=>parseMeasurementFile(packet([record(),record()])));
  assert.throws(()=>parseMeasurementFile(packet([record({id:'__proto__'})])));
  assert.throws(()=>parseMeasurementFile('{bad JSON'));
  assert.throws(()=>parseMeasurementFile(JSON.stringify({schema_version:2,records:[]})));
  assert.throws(()=>parseMeasurementFile(' '.repeat(1000001)));
});
test('CSV quotes commas, quotes and multiline data and neutralises spreadsheet formulas',()=>{
  const csv=toCSV([['中文','a,b','a"b','a\nb','=1+1',' +SUM(A1)','@cmd','-2']]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.endsWith('\r\n'));
  assert.ok(csv.includes('"a,b"'));assert.ok(csv.includes('"a""b"'));assert.ok(csv.includes('"a\nb"'));
  for(const value of ["'=1+1","' +SUM(A1)","'@cmd","'-2"])assert.ok(csv.includes(value));
});
test('CLI resolves data from the project instead of current working directory',()=>{
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('scripts/audit-dimensions.mjs',root)),'--json'],{cwd:tmpdir(),encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).data_status,'pass');
});
test('CLI unknown argument returns 2 without pretending a completed check',()=>{
  const child=spawnSync(process.execPath,[fileURLToPath(new URL('scripts/audit-dimensions.mjs',root)),'--unknown'],{encoding:'utf8'});
  assert.equal(child.status,2);assert.match(child.stderr,/未知参数/);
});
