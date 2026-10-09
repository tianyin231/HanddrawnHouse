/** Reversible roof massing only. No structural, drainage or daylight acceptance. */
export const ROOF_PROPOSAL = Object.freeze({ fasciaHeightMm: 180, ridgeRiseMm: 1800 });

/** Upper-floor LOCAL coordinates: x=east, y=up, z=-north; metres. */
export function roofEnvelope(p) {
  if (!p || p.units !== 'mm') throw new Error('屋顶概念需要毫米参数。');
  for (const key of ['site_width', 'house_depth', 'courtyard_depth', 'wall_height', 'floor_to_floor']) {
    if (!Number.isFinite(p[key]) || p[key] <= 0) throw new Error(`屋顶参数无效：${key}`);
  }
  if (p.upper_front_area !== 'courtyard_void') throw new Error('前院挑空约束改变，请先复核屋顶范围。');
  const w = p.site_width / 1000, s = p.courtyard_depth / 1000;
  const n = s + p.house_depth / 1000, b = p.wall_height / 1000;
  // 180 mm is a fascia silhouette, NOT a proposed structural slab thickness.
  const e = b + ROOF_PROPOSAL.fasciaHeightMm / 1000;
  const r = e + ROOF_PROPOSAL.ridgeRiseMm / 1000;
  const section = [[b, -s], [b, -n], [e, -n], [r, -(s + n) / 2], [e, -s]];
  const positions = [0, w].flatMap(x => section.map(([y, z]) => [x, y, z]));
  const triangles = [], materials = [];
  const face = (a, b, c, material) => { triangles.push([a, b, c]); materials.push(material); };
  for (let i = 1; i < 4; i++) {
    face(0, i + 1, i, 1); // west gable, outward -X
    face(5, 5 + i, 6 + i, 1); // east gable, outward +X
  }
  for (let i = 0; i < 5; i++) {
    const j = (i + 1) % 5;
    const material = i === 2 || i === 3 ? 0 : i === 0 ? 2 : 1;
    face(i, j, 5 + j, material); face(i, 5 + j, 5 + i, material);
  }
  return {
    positions, triangles, materials,
    footprintMm: [0, p.courtyard_depth, p.site_width, p.courtyard_depth + p.house_depth],
    worldRidgeHeightMm: p.floor_to_floor + p.wall_height + ROOF_PROPOSAL.fasciaHeightMm + ROOF_PROPOSAL.ridgeRiseMm,
    status: 'needs_review', classification: 'closed_massing_proxy_not_roof_assembly'
  };
}

export function roofIsVisible(state) {
  return state.roof === true && state.view === 'whole' && state.cut === false;
}

/** Use the viewer's existing Three.js instance; do not load another version. */
export function createRoofConcept(THREE, parameters) {
  const envelope = roofEnvelope(parameters);
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(envelope.positions.flat(), 3));
  source.setIndex(envelope.triangles.flat());
  const geometry = source.toNonIndexed();
  source.dispose();
  geometry.computeVertexNormals();
  envelope.materials.forEach((material, i) => geometry.addGroup(i * 3, 3, material));
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#515e66', roughness: .88 }),
    new THREE.MeshStandardMaterial({ color: '#dedfd8', roughness: .95 }),
    new THREE.MeshStandardMaterial({ color: '#c1c6c3', roughness: 1 })
  ];
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.name = 'RoofConcept/gable-massing';
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'RoofConcept';
  group.userData = { concept_only: true, model_status: 'needs_review', source: 'house_parameters.json',
    classification: envelope.classification, proposal: { ...ROOF_PROPOSAL } };
  group.add(mesh); group.visible = false;
  return group;
}
