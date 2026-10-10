// 庭院和附属间的方案标高共用这一处计算；室内 ±0 与三级台阶标高不变。
export const ANNEX_EDGE={width:.10,baseAboveWall:.12,height:.27,capThickness:.025};
export function yardElevationAt(p, y) {
  const e=p.entrance_proposal,q=p.site_detail_proposal;
  const firstStep=(p.courtyard_depth-e.landing_outside_mm-(e.riser_count-1)*e.tread_mm)/1000;
  const drain=q.drain_y_mm/1000;
  return -e.yard_drop_mm/1000+(Math.abs(y-drain)-(firstStep-drain))*q.yard_slope_ratio;
}

export function siteLayout(p, plan) {
  const q=p.site_detail_proposal,w=p.site_width/1000,d=p.courtyard_depth/1000;
  const drain=q.drain_y_mm/1000,half=q.drain_width_mm/2000;
  const screen=plan.annex_passage.screen_axis_x/1000;
  const annexWest=plan.annex_passage.bounds[2]/1000;
  const outlet=[w-.38,4.09-.25];
  return {
    status:q.status,
    columns:[p.west_bay_width/1000+.06,plan.stairs.entry_x/1000-.20,w-q.column_width_mm/2000],
    columnWidth:q.column_width_mm/1000,beamDepth:q.porch_beam_depth_mm/1000,
    porchY:d+q.column_width_mm/2000,
    yardRows:[0,drain-half,drain,drain+half,4.09,d].map(y=>[y,yardElevationAt(p,y)]),
    drain:{y:drain,width:half*2,segments:[[.46,screen-.11],[screen+.11,annexWest-.02]],outfall:'site_connection_not_surveyed'},
    gate:{hinges:[[.20,.36],[.20,3.64]],leafWidth:1.61,height:q.gate_leaf_height_mm/1000,
      elevation:yardElevationAt(p,2),openAngles:[-Math.PI/2,Math.PI/2]},
    annex:{bounds:[annexWest,0,w,4.09],outlet,openingRadius:.07,
      roofBase:p.annex_height/1000,roofLow:p.annex_height/1000+.12,
      roofSlope:q.annex_roof_slope_ratio,elevation:-p.entrance_proposal.yard_drop_mm/1000}
  };
}

export function annexRoofHeightAt(annex,x,y) {
  // 网格在方形落水孔四边处分块；穿过孔轴线的窄条在对应方向保持同高。
  // 与实际分块坡面一致；孔内没有屋面，调用方只在孔外查询。
  return annex.roofLow+(Math.max(annex.openingRadius,Math.abs(x-annex.outlet[0]))+Math.max(annex.openingRadius,Math.abs(y-annex.outlet[1])))*annex.roofSlope;
}
