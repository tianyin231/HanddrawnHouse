import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roofEnvelope, roofIsVisible, createRoofConcept, ROOF_PROPOSAL } from '../viewer/roof-concept.js';
const parameters = JSON.parse(readFileSync(new URL('../house_parameters.json', import.meta.url), 'utf8'));
const mesh = roofEnvelope(parameters);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a.reduce((s, v, i) => s + v*b[i], 0);

test('roof is a finite, closed ten-vertex/sixteen-triangle concept, not an accepted assembly', () => {
  assert.equal(mesh.positions.length, 10); assert.equal(mesh.triangles.length, 16);
  assert.ok(mesh.positions.flat().every(Number.isFinite));
  assert.equal(mesh.status, 'needs_review');
  assert.equal(mesh.classification, 'closed_massing_proxy_not_roof_assembly');
});
test('roof remains within the original main-house footprint and never covers the courtyard', () => {
  for (const [x, , z] of mesh.positions) {
    assert.ok(x >= 0 && x <= parameters.site_width/1000);
    assert.ok(-z >= parameters.courtyard_depth/1000);
    assert.ok(-z <= (parameters.courtyard_depth + parameters.house_depth)/1000);
  }
  assert.deepEqual(mesh.footprintMm, [0, parameters.courtyard_depth, parameters.site_width, parameters.courtyard_depth+parameters.house_depth]);
});
test('roof joins the existing upper wall top and uses a single floor elevation', () => {
  const heights = mesh.positions.map(p => p[1]);
  assert.equal(Math.min(...heights), parameters.wall_height/1000);
  assert.ok(Math.abs(Math.max(...heights)*1000 + parameters.floor_to_floor - mesh.worldRidgeHeightMm) < 1e-9);
});
test('every face has nonzero area and outward orientation', () => {
  const center = mesh.positions.reduce((s,p) => s.map((v,i) => v+p[i]/10), [0,0,0]);
  for (const face of mesh.triangles) {
    assert.equal(new Set(face).size, 3);
    assert.ok(face.every(i => Number.isInteger(i) && i >= 0 && i < mesh.positions.length));
    const [a,b,c] = face.map(i => mesh.positions[i]);
    const normal = cross(sub(b,a),sub(c,a));
    assert.ok(Math.hypot(...normal) > 1e-8);
    const centroid = a.map((v,i) => (v+b[i]+c[i])/3);
    assert.ok(dot(normal,sub(centroid,center)) > 0, `inward face ${face}`);
  }
});
test('each edge has exactly two oppositely oriented neighbours', () => {
  const edges = new Map();
  for (const t of mesh.triangles) for (let i=0;i<3;i++) {
    const a=t[i],b=t[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
    edges.set(key,[...(edges.get(key)||[]),a<b?1:-1]);
  }
  for(const e of edges.values()) { assert.equal(e.length,2); assert.equal(e[0]+e[1],0); }
});
test('positive signed massing volume agrees with the polygon cross-section', () => {
  const volume = mesh.triangles.reduce((v,t) => { const [a,b,c]=t.map(i=>mesh.positions[i]);return v+dot(a,cross(b,c))/6; },0);
  const expected = parameters.site_width/1000 * parameters.house_depth/1000 * (ROOF_PROPOSAL.fasciaHeightMm + ROOF_PROPOSAL.ridgeRiseMm/2)/1000;
  assert.ok(Math.abs(volume-expected)<1e-8);assert.ok(volume>0);
});
test('roof is visible only in uncut whole-house view when requested', () => {
  for (const view of ['floor1','floor2','whole','exploded']) for(const cut of [true,false]) for(const roof of [true,false])
    assert.equal(roofIsVisible({view,cut,roof}),view==='whole'&&!cut&&roof);
});
test('data changes regenerate roof dimensions without writing back parameters', () => {
  const p=Object.freeze({...parameters,site_width:15000,house_depth:14000,courtyard_depth:7500});
  const before=JSON.stringify(p), result=roofEnvelope(p);
  assert.deepEqual(result.footprintMm,[0,7500,15000,21500]);assert.equal(JSON.stringify(p),before);
});
test('invalid dimensions, units and changed courtyard constraint fail closed', () => {
  for(const value of [null,NaN,Infinity,0,-1,'14700']) assert.throws(()=>roofEnvelope({...parameters,site_width:value}));
  assert.throws(()=>roofEnvelope({...parameters,units:'m'}));
  assert.throws(()=>roofEnvelope({...parameters,upper_front_area:'terrace'}));
});
test('roof surfaces, gables and underside have complete material assignments', () => {
  assert.equal(mesh.materials.length,mesh.triangles.length);
  assert.equal(mesh.materials.filter(m=>m===0).length,4);
  assert.ok(mesh.materials.every(m=>[0,1,2].includes(m)));
});
test('viewer adapter uses supplied geometry API and creates an initially hidden, labelled group (API doubles, not WebGL)', () => {
  class Geometry {
    constructor(){this.groups=[];}
    setAttribute(name,value){this[name]=value;}
    setIndex(value){this.indices=value;}
    toNonIndexed(){const copy=new Geometry();copy.position=this.indices.flatMap(i=>this.position.array.slice(i*3,i*3+3));return copy;}
    computeVertexNormals(){this.normalsComputed=true;}
    addGroup(start,count,materialIndex){this.groups.push({start,count,materialIndex});}
    dispose(){this.disposed=true;}
  }
  class Attribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
  class Material {constructor(options){Object.assign(this,options);} }
  class Mesh {constructor(geometry,material){this.geometry=geometry;this.material=material;} }
  class Group {constructor(){this.children=[];}add(child){this.children.push(child);} }
  const group=createRoofConcept({BufferGeometry:Geometry,Float32BufferAttribute:Attribute,MeshStandardMaterial:Material,Mesh,Group},parameters);
  assert.equal(group.visible,false);assert.equal(group.userData.model_status,'needs_review');
  assert.equal(group.children.length,1);assert.equal(group.children[0].geometry.groups.length,16);
  assert.equal(group.children[0].geometry.position.length,144);
  assert.equal(group.children[0].geometry.normalsComputed,true);
});
test('viewer integration retains the original GLB and mounts roof after original mesh setup', () => {
  const app=readFileSync(new URL('../viewer/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../viewer/index.html',import.meta.url),'utf8');
  assert.ok(app.includes("loadAsync('/output/house.glb')"));
  assert.ok(app.includes('roots.get(2).add(roofConcept)'));
  assert.ok(app.indexOf('roots.get(2).add(roofConcept)')>app.indexOf('makeCutCaps(plan, root); makeCorrections(plan, root);'));
  assert.ok(app.includes('root.traverseVisible'));
  assert.ok(app.includes('if (roofConcept?.visible || e.button'));
  assert.ok(html.includes('id="roof-concept"'));
  assert.ok(html.includes('原 GLB / Blender 文件不含此预览'));
});
