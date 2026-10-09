import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCourtyardDesign, courtyardLayout, gardenIsVisible } from '../viewer/courtyard-design.js';

const read = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const p = read('house_parameters.json'), plan = read('plan_floor_1.json');
const sourceBefore = JSON.stringify([p, plan]);
const layout = courtyardLayout(p, plan), group = createCourtyardDesign(p, plan);
group.updateMatrixWorld(true);

function assertClearPaths(model) {
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 2.34);
  for (const path of layout.paths) {
    const [x0, y0, x1, y1] = path.bounds;
    for (let x = x0 + .1; x < x1 - .05; x += .2) for (let y = y0 + .1; y < y1 - .05; y += .2) {
      ray.ray.origin.set(x, layout.elevation + 2.4, -y);
      assert.equal(ray.intersectObject(model, true).length, 0, `${path.id} 的 ${x.toFixed(2)}, ${y.toFixed(2)} 米存在新增障碍`);
    }
  }
}

test('庭院只布置在院界内，参数和平面保持只读', () => {
  assert.equal(JSON.stringify([p, plan]), sourceBefore);
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.x >= -1e-5 && bounds.max.x <= p.site_width / 1000 + 1e-5);
  assert.ok(bounds.min.z >= -p.courtyard_depth / 1000 - 1e-5 && bounds.max.z <= 1e-5);
  assert.equal(group.userData.concept_only, true);
  assert.ok(group.children.length <= 16, '树叶和铺装应按材质合并');
});

test('新增家具和植物不侵入入户动线、门廊入口和附属间 2 米通道', () => {
  assert.equal(layout.passage[2] - layout.passage[0], 2);
  assertClearPaths(group);
});

test('庭院方案可关闭且不遮住楼层、分层与剖切核对', () => {
  for (const view of ['whole', 'courtyard', 'floor1', 'floor2', 'exploded']) {
    for (const cut of [true, false]) for (const garden of [true, false])
      assert.equal(gardenIsVisible({ view, cut, garden }), garden && !cut && ['whole', 'courtyard'].includes(view));
  }
});

test('实际下载模型包含相同庭院几何和待复核标记，通道仍畅通', async () => {
  const bytes = readFileSync(new URL('../output/house.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const exported = gltf.scene.getObjectByName('CourtyardDesign');
  assert.ok(exported, '庭院必须写入 GLB');
  assert.equal(exported.parent.name, 'Floor_1');
  assert.equal(exported.userData.model_status, 'needs_review');
  gltf.scene.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(group), after = new THREE.Box3().setFromObject(exported);
  assert.ok(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5);
  const count = node => { let triangles = 0; node.traverse(o => { if (o.isMesh) triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }); return triangles; };
  assert.equal(count(exported), count(group));
  // 展开的三角形经 Blender 回读后必须保持绕序，否则树叶和圆桌会出现交替黑面。
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  exported.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry, position = geometry.attributes.position, normals = geometry.attributes.normal;
    for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
      const ids = [0, 1, 2].map(j => geometry.index ? geometry.index.getX(i + j) : i + j);
      a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
      normal.fromBufferAttribute(normals, ids[0]);
      assert.ok(b.sub(a).cross(c.sub(a)).dot(normal) >= -1e-7, `${object.name} 面朝向与法线不符`);
    }
  });
  assertClearPaths(exported);
});
