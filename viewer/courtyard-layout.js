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
      { id: 'south-border', bounds: [2.15, .45, screen - .65, 1.25], height: .28 },
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
