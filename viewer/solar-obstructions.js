export const SUN_BLOCKER_GROUPS={
  roof:'屋面与檐口',porch:'门廊梁柱与边梁',slab:'楼板',stairs:'楼梯与梯栏',rails:'门廊栏杆',
  vegetation:'庭院植物',yard:'院墙与庭院构筑',walls:'房屋墙体',openings:'门窗框与门扇',
  'neighbor-north':'北侧院墙','neighbor-south':'南侧邻房','neighbor-east':'东侧邻房',other:'其他构件'
};

// 优先采用模型元数据和祖先分组；GLTF 加载器会清理节点名中的斜杠，原名保存在 userData.name。
export function sunBlockerInfo(object) {
  const ancestors=[];for(let node=object;node;node=node.parent)ancestors.push(node);
  const name=object.userData.name||object.name;
  const level=Number(ancestors.find(n=>/^Floor_[12]$/.test(n.name))?.name.slice(-1))||null;
  const has=pattern=>ancestors.some(n=>pattern.test(n.name)||pattern.test(n.userData.name||''));
  let group='other';
  if(has(/^NeighborStudy$/))group=`neighbor-${object.name}`;
  else if(['bark','leaf','leafDark','leafLight','flowers'].includes(object.userData.garden_material))group='vegetation';
  else if(has(/(^|\/)(CourtyardDesign|SiteDetails)$|(^|\/)GateLeaf_/))group='yard';
  else if(has(/(^|\/)(RoofConcept|RainwaterSystem)$/))group='roof';
  else if(has(/(^|\/)StructureProposal_/))group='porch';
  else if(/\/floor\/property-boundary/.test(name))group='slab';
  else if(/\/stair\/|\/upper\/stair-/.test(name))group='stairs';
  else if(/\/upper\/porch-guard/.test(name))group='rails';
  else if(object.userData.opening_kind||object.userData.glazing_proxy||has(/(^|\/)DoorDesign_/))group='openings';
  else if(object.userData.wall_id)group=/^(yard|annex)-/.test(object.userData.wall_id)?'yard':'walls';
  const label=SUN_BLOCKER_GROUPS[group]||SUN_BLOCKER_GROUPS.other;
  return {id:ancestors.reverse().map(n=>n.userData.name||n.name).filter(Boolean).join(' > '),group,label,
    component:`${level?`${level}层` : ''}${label}`,level,source_name:name};
}

export function summarizeObstructions(bins) {
  const groups=new Map();let nightMinutes=0,backFacingMinutes=0,blockedMinutes=0;
  for(const bin of bins) {
    const duration=bin.end-bin.start,center=bin.center_diagnostic;
    if(center.state==='night')nightMinutes+=duration;
    if(center.state==='back')backFacingMinutes+=duration;
    if(center.state!=='blocked')continue;
    blockedMinutes+=duration;
    const id=center.hit.group;
    if(!groups.has(id))groups.set(id,{id,label:center.hit.label,nearestMinutes:0,withoutGroupGainMinutes:0,exampleMinute:bin.sampled_at});
    const entry=groups.get(id);entry.nearestMinutes+=duration;
    // 同一路径还被别类构件挡住时，忽略最近的一类也不会新增直射，不能重复记作改善量。
    if(center.groups.length===1)entry.withoutGroupGainMinutes+=duration;
  }
  return {nightMinutes,backFacingMinutes,blockedMinutes,groups:[...groups.values()].sort((a,b)=>b.nearestMinutes-a.nearestMinutes)};
}
