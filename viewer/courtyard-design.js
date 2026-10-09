import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 庭院概念：几何以米表示，位置采用平面图的东、北、高坐标。
// 不指定采购树种、基础做法及排水坡度，保留原户型和现场复测状态。
export const GARDEN_MATERIALS = {
  paving: { color: '#c5c6bb', roughness: .92 },
  pavingLight: { color: '#d7d5c9', roughness: .92 },
  gravel: { color: '#a8ad9a', roughness: 1 },
  stone: { color: '#737e73', roughness: .9 },
  wood: { color: '#a38058', roughness: .76 },
  bark: { color: '#625744', roughness: 1 },
  metal: { color: '#35483e', roughness: .55, metalness: .25 },
  linen: { color: '#ede6d5', roughness: 1 },
  leaf: { color: '#577944', roughness: .9 },
  leafLight: { color: '#829553', roughness: .9 },
  leafDark: { color: '#345d3e', roughness: .95 },
  flowers: { color: '#a3a0b9', roughness: .85 },
  plaster: { color: '#e9e7dc', roughness: .95 },
  roof: { color: '#535e55', roughness: .88 },
  lamp: { color: '#ffe6b1', roughness: .4, emissive: '#ffd08a', emissiveIntensity: .35 }
};

export function courtyardLayout(p, plan) {
  if (p.units !== 'mm' || p.upper_front_area !== 'courtyard_void') throw new Error('庭院方案需要毫米平面和前院挑空。');
  const width = p.site_width / 1000, depth = p.courtyard_depth / 1000;
  const passage = plan.annex_passage.bounds.map(value => value / 1000);
  const screen = plan.annex_passage.screen_axis_x / 1000;
  const wall = p.exterior_wall_thickness / 1000;
  // 布置随院深和挡墙定位移动，不用图像像素作为尺寸依据。
  const north = depth - .35;
  return {
    width, depth, passage, screen, wall, elevation: -p.entrance_proposal.yard_drop_mm / 1000,
    status: 'concept_only_needs_review',
    paths: [
      { id: 'gate-to-yard', bounds: [.36, 1.55, 7.3, 3.45], clearWidth: 1.9 },
      { id: 'yard-to-porch', bounds: [5.5, 3.45, 7.3, depth], clearWidth: 1.8 },
      { id: 'annex-passage', bounds: passage, clearWidth: p.annex_passage_clear_width / 1000 },
      { id: 'across-annex', bounds: [7.3, 4.1, width - wall, 5.4], clearWidth: 1.3 }
    ],
    beds: [
      { id: 'south-border', bounds: [.65, .45, screen - .65, 1.25], height: .28 },
      { id: 'tree-garden', bounds: [.6, depth - 2.3, 2.7, north], height: .24 },
      { id: 'east-border', bounds: [width - 1.05, 5.65, width - .35, depth - .35], height: .3 }
    ],
    terrace: [2.85, depth - 3.05, 5.05, north],
    tree: { x: 1.68, y: depth - 1.38, height: 3.25, crownRadius: .98 },
    annex: [passage[2], 0, width, 4.09],
    lights: [
      [1.0, 1.02, .55], [screen - .98, .98, .55],
      [.9, depth - .65, .55], [width - .7, depth - .68, .6],
      [screen - .18, 3.5, 1.35]
    ]
  };
}

export function gardenIsVisible(state) {
  return state.garden && !state.cut && ['whole', 'courtyard'].includes(state.view);
}

export function createCourtyardDesign(p, plan) {
  const layout = courtyardLayout(p, plan), buckets = new Map();
  let seed = 421;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const point = ([x, y, h]) => new THREE.Vector3(x, h + layout.elevation, -y);
  const add = (material, geometry, position, rotation = 0) => {
    geometry.rotateY(rotation);
    geometry.translate(...point(position).toArray());
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    // 只保留共享的顶点属性，后续按材质合并，降低树叶和铺装的绘制开销。
    flat.deleteAttribute('uv');
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(flat);
  };
  const box = (material, bounds, bottom, height) => {
    const [x0, y0, x1, y1] = bounds;
    add(material, new THREE.BoxGeometry(x1 - x0, height, y1 - y0), [(x0 + x1) / 2, (y0 + y1) / 2, bottom + height / 2]);
  };
  const cylinder = (material, x, y, bottom, height, radius, top = radius) =>
    add(material, new THREE.CylinderGeometry(top, radius, height, 16), [x, y, bottom + height / 2]);
  const branch = (a, b, radius) => {
    const start = point(a), end = point(b), direction = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(radius * .6, radius, direction.length(), 8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    add('bark', g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  };
  const foliage = (x, y, h, sx, sy, sz, material = 'leaf') => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(sx, sz, sy);
    add(material, g, [x, y, h], random() * Math.PI);
  };
  const inset = (b, d) => [b[0] + d, b[1] + d, b[2] - d, b[3] - d];
  const inside = (x, y, b) => x > b[0] && x < b[2] && y > b[1] && y < b[3];

  // 600 mm 方砖，完成面与降低后的院面一致。
  const { width, depth, wall, screen, beds, terrace } = layout;
  const pavedAreas = [[wall, wall, screen - .1, 4.09], [screen + .1, wall, layout.annex[0], 4.09], [wall, 4.1, width - wall, depth - .02]];
  for (const [x0, y0, x1, y1] of pavedAreas) for (let x = x0; x < x1; x += .6) for (let y = y0; y < y1; y += .6) {
    const endX = Math.min(x + .59, x1), endY = Math.min(y + .59, y1);
    if (beds.some(b => inside((x + endX) / 2, (y + endY) / 2, b.bounds))) continue;
    box(random() > .8 ? 'pavingLight' : 'paving', [x, y, endX, endY], -.012, .014);
  }
  // 醒目的入户纵向铺地，不增加实体障碍。
  for (let y = 3.52; y < depth - .1; y += .75) box('pavingLight', [5.59, y, 7.21, Math.min(y + .72, depth - .03)], -.006, .008);
  box('gravel', terrace, .027, .014);
  for (let x = terrace[0] + .06; x < terrace[2] - .02; x += .36) {
    box('pavingLight', [x, terrace[1] + .04, Math.min(x + .34, terrace[2] - .04), terrace[3] - .04], .042, .014);
  }
  for (const bed of beds) {
    const b = bed.bounds, h = bed.height;
    box('stone', b, .02, h);
    box('gravel', inset(b, .085), h + .02, .018);
    // 多株、不同高度的常绿体量，树种和最终密度后续结合现场选定。
    for (let x = b[0] + .23; x < b[2] - .1; x += .4) for (let y = b[1] + .24; y < b[3] - .1; y += .4) {
      if (bed.id === 'tree-garden' && Math.hypot(x - layout.tree.x, y - layout.tree.y) < .45) continue;
      const radius = .13 + random() * .13;
      foliage(x, y, h + .12, radius, radius, .15 + random() * .17, random() > .5 ? 'leaf' : 'leafLight');
      if (random() > .64) {
        for (let i = 0; i < 4; i++) {
          const px = x + (random() - .5) * .24, py = y + (random() - .5) * .24;
          cylinder('leafDark', px, py, h + .05, .36, .008);
          foliage(px, py, h + .43, .032, .032, .085, 'flowers');
        }
      }
    }
  }

  // 一棵有分枝和透空冠幅的庭院树，避开入户轴线与楼梯。
  const tree = layout.tree;
  branch([tree.x, tree.y, .26], [tree.x + .08, tree.y, 1.9], .085);
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.4, reach = .47 + random() * .28;
    const center = [tree.x + Math.cos(angle) * reach, tree.y + Math.sin(angle) * reach, 2.28 + random() * .47];
    branch([tree.x + .04, tree.y, 1.35 + random() * .4], center, .026);
    for (let j = 0; j < 115; j++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * .43;
      const h = (random() - .5) * .58;
      const leaf = new THREE.SphereGeometry(1, 6, 4);
      leaf.scale(.065 + random() * .04, .012, .035 + random() * .035);
      leaf.rotateX((random() - .5) * 1.5); leaf.rotateZ((random() - .5) * 1.3);
      add(['leaf', 'leafLight', 'leafDark'][Math.floor(random() * 3)], leaf,
        [center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r, center[2] + h], random() * Math.PI);
    }
  }

  // 木条坐凳 + 圆桌 + 单椅，休憩家具均位于通道以西。
  const benchY = depth - .95;
  for (const x of [3.08, 4.69]) box('metal', [x, benchY - .24, x + .08, benchY + .24], .05, .37);
  for (let y = benchY - .29; y < benchY + .28; y += .095) box('wood', [2.95, y, 4.93, y + .075], .43, .05);
  for (const x of [3.05, 4.75]) box('metal', [x, benchY + .23, x + .055, benchY + .3], .44, .43);
  for (let h = .58; h < .9; h += .10) box('wood', [2.96, benchY + .25, 4.92, benchY + .31], h, .065);
  box('linen', [3.06, benchY - .23, 3.90, benchY + .18], .48, .055);
  box('linen', [3.98, benchY - .23, 4.83, benchY + .18], .48, .055);
  cylinder('metal', 3.95, depth - 2.02, .05, .44, .045);
  cylinder('metal', 3.95, depth - 2.02, .048, .035, .25);
  cylinder('wood', 3.95, depth - 2.02, .49, .055, .43);
  cylinder('plaster', 3.98, depth - 2.02, .545, .14, .075, .055);
  foliage(3.98, depth - 2.02, .73, .11, .11, .12, 'leafLight');
  const chairY = depth - 2.69;
  for (const x of [3.50, 4.08]) for (const y of [chairY - .20, chairY + .20])
    box('metal', [x, y, x + .045, y + .045], .05, .4);
  box('wood', [3.46, chairY - .28, 4.16, chairY + .3], .43, .06);
  box('linen', [3.50, chairY - .23, 4.12, chairY + .25], .49, .06);
  box('wood', [3.46, chairY - .3, 4.16, chairY - .24], .5, .34);

  // 利用现有挡墙做木格栅，装饰厚度全部放在西侧，不挤占东侧 2 米通道。
  for (let y = .32; y < 3.9; y += .13) box('wood', [screen - .125, y, screen - .095, y + .065], .23, 1.40);
  box('stone', [screen - .09, .02, screen + .09, 3.99], 1.8, .045);
  for (const lamp of layout.lights.slice(0, 4)) {
    const [x, y, h] = lamp;
    box('metal', [x - .07, y - .07, x + .07, y + .07], .02, h - .09);
    box('lamp', [x - .055, y - .055, x + .055, y + .055], h - .09, .08);
    box('metal', [x - .085, y - .085, x + .085, y + .085], h - .01, .025);
  }
  box('metal', [screen - .16, 3.36, screen - .105, 3.64], 1.10, .31);
  box('lamp', [screen - .175, 3.41, screen - .16, 3.59], 1.13, .20);

  // 附属间的可撤回封顶概念，只覆盖附属间范围，不跨入通道或主院上空。
  const [ax0, ay0, ax1, ay1] = layout.annex;
  const annexHeight = p.annex_height / 1000, yardHeight = p.courtyard_wall_height / 1000;
  box('plaster', [ax0, ay0, ax1, wall], yardHeight, annexHeight - yardHeight);
  box('plaster', [width - wall, ay0, width, 4], yardHeight, annexHeight - yardHeight);
  box('roof', layout.annex, annexHeight, .12);
  // 薄女儿墙与金属压顶均收在附属间范围内，给平屋面留下真实收边厚度。
  for (const bounds of [[ax0, ay0, ax1, ay0 + .10], [ax0, ay0 + .10, ax0 + .10, ay1],
    [ax1 - .10, ay0 + .10, ax1, ay1], [ax0 + .10, ay1 - .10, ax1 - .10, ay1]]) {
    box('plaster', bounds, annexHeight + .12, .14);
    box('roof', bounds, annexHeight + .26, .025);
  }
  box('wood', [ax0, .05, ax0 + .045, ay1 - .05], annexHeight - .14, .14);

  const group = new THREE.Group();
  group.name = 'CourtyardDesign';
  group.userData = { model_component: true, concept_only: true, model_status: 'needs_review',
    source: 'viewer/courtyard-design.js', layout, lighting_status: 'atmosphere_only_not_daylight_simulation' };
  for (const [name, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: `garden/${name}`, ...GARDEN_MATERIALS[name] }));
    mesh.name = `CourtyardDesign/${name}`;
    mesh.castShadow = !['paving', 'pavingLight', 'gravel'].includes(name); mesh.receiveShadow = true;
    mesh.userData = { garden_material: name, concept_only: true };
    group.add(mesh);
  }
  return group;
}
