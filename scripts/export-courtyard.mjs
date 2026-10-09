import { readFileSync } from 'node:fs';
import { createCourtyardDesign, GARDEN_MATERIALS } from '../viewer/courtyard-design.js';

const read = filename => JSON.parse(readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'));
const group = createCourtyardDesign(read('house_parameters.json'), read('plan_floor_1.json'));
process.stdout.write(JSON.stringify({
  metadata: group.userData,
  meshes: group.children.map(mesh => ({
    name: mesh.name, materialName: mesh.userData.garden_material,
    material: GARDEN_MATERIALS[mesh.userData.garden_material],
    positions: Array.from(mesh.geometry.attributes.position.array),
    normals: Array.from(mesh.geometry.attributes.normal.array)
  }))
}));
