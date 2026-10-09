import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachRoofConcept, roofEnvelope } from '../viewer/roof-concept.js';

const parameters = JSON.parse(readFileSync(new URL('../house_parameters.json', import.meta.url), 'utf8'));

test('下载的 GLB 包含唯一屋顶，真实坐标与浏览器概念一致', async () => {
  const bytes = readFileSync(new URL('../output/house.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const upper = gltf.scene.getObjectByName('Floor_2');
  const roof = upper.getObjectByName('RoofConcept');
  assert.ok(roof, '请运行 rebuild.ps1，将屋顶写入下载模型');
  assert.equal(roof.parent, upper);
  assert.equal(roof.userData.concept_only, true);
  assert.equal(roof.userData.model_status, 'needs_review');
  const childrenBefore = upper.children.length;
  const mounted = attachRoofConcept(THREE, upper, parameters);
  assert.equal(mounted.group, roof);
  assert.equal(mounted.embedded, true);
  assert.equal(upper.children.length, childrenBefore, '不得重复创建屋顶');

  gltf.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(roof);
  const expected = roofEnvelope(parameters);
  const close = (value, target) => assert.ok(Math.abs(value - target) < 1e-5, `${value} != ${target}`);
  close(bounds.min.x, 0);
  close(bounds.max.x, parameters.site_width / 1000);
  close(bounds.min.z, -(parameters.courtyard_depth + parameters.house_depth) / 1000);
  close(bounds.max.z, -expected.footprintMm[1] / 1000);
  close(bounds.min.y, parameters.floor_to_floor / 1000 + expected.localMinHeightM);
  close(bounds.max.y, expected.worldRidgeHeightMm / 1000);
  let triangles = 0;
  roof.traverse(object => {
    if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  assert.equal(triangles, expected.triangles.length);
  const ray = new THREE.Raycaster(new THREE.Vector3(parameters.site_width / 2000, 30, -parameters.courtyard_depth / 2000), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(roof, true).length, 0, '屋顶不能覆盖前院');
});

test('旧模型可补充浏览器屋顶，重复挂载仍只保留一份', () => {
  const upper = new THREE.Group();
  const result = attachRoofConcept(THREE, upper, parameters);
  assert.equal(result.embedded, false);
  assert.equal(result.group.visible, false);
  assert.equal(result.group.parent, upper);
  assert.equal(attachRoofConcept(THREE, upper, parameters).group, result.group);
  assert.equal(upper.children.length, 1);
});
