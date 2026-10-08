/** Read-only, dependency-free checks shared by the browser and Node.
 * These checks compare the parameter/plan contracts, NOT surveyed or built geometry.
 * Units are millimetres unless a field explicitly says otherwise.
 */
export const AUDIT_VERSION = 1;
export const BASIS_LABELS = Object.freeze({
  outer: '外缘到外缘', allocated: '含墙分配尺寸', wall: '墙体本体厚度',
  clear: '结构净空', finished: '完成面净空', floor: '层间标高差',
  elevation: '相对同一基准标高', opening: '结构洞口尺寸',
  offset: '相对注明的起点', count: '数量', angle: '真北方位角', other: '其他口径'
});
const fields = [
  ['site_width','场地总宽','边界','outer','用户约数','南北两端分别量取；不规则边界另外绘图'],
  ['house_depth','主体进深','边界','outer','图纸含墙','主体南外缘至北外缘'],
  ['courtyard_depth','前院进深','边界','outer','图纸含墙','南院界至主体南外缘'],
  ['west_bay_width','西侧开间','分间','allocated','图纸含墙','核对外缘与共享墙分摊线，不填室内净宽'],
  ['northwest_room_width','西北卧室开间','分间','allocated','图纸含墙','核对 4.2 米标注的起止边'],
  ['east_bay_width','东侧开间','分间','allocated','图纸含墙','核对共享墙分摊线至东外缘'],
  ['north_room_depth','北排进深','分间','allocated','图纸含墙','核对北排共享墙及外墙的分摊口径'],
  ['north_small_room_width','北侧窄间开间','分间','allocated','图纸含墙','一层烧香间；用途确认不等于尺寸实测'],
  ['master_bedroom_depth','主卧进深','分间','allocated','图纸含墙','4.5 米为含墙分配尺寸'],
  ['dining_depth','餐厅进深','分间','allocated','图纸含墙','一层餐厅，分清共享墙中心线'],
  ['kitchen_depth','厨房进深','分间','allocated','图纸含墙','一层厨房，分清共享墙中心线'],
  ['floor_to_floor','层高','标高与墙厚','floor','暂定','同一基准下的两层楼面标高差；同时记录饰面层'],
  ['wall_height','墙体建模高度','标高与墙厚','clear','暂定','当前从楼层基准面起算；不是完成面净高'],
  ['exterior_wall_thickness','外墙厚度','标高与墙厚','wall','暂定','记录墙体本体，内外饰面分别量取'],
  ['interior_wall_thickness','内墙厚度','标高与墙厚','wall','暂定','不同墙体分别记录，不能一处代替全屋'],
  ['slab_thickness','楼板厚度','标高与墙厚','wall','暂定','与设计图及现场对应；不可仅凭外观推定'],
  ['courtyard_wall_height','院墙高度','标高与墙厚','elevation','暂定','从院地基准面起量'],
  ['annex_height','附属间高度','标高与墙厚','elevation','暂定','附属间 A、B 分别复测'],
  ['annex_passage_clear_width','附属间门前通道','通道与楼梯','clear','用户确认的设计目标','目标 2 米；沿通道取最窄处，扣除墙体'],
  ['passage_clear_width','套间过道净宽','通道与楼梯','clear','暂定','不是含墙开间；饰面完成后还会缩小'],
  ['suite_entry_y','套间入口位置','通道与楼梯','offset','暂定','南侧场地前边至入口门轴线，注明起点'],
  ['stair_risers','楼梯踢面数','通道与楼梯','count','设计建议','逐级核对，含到达平台的最后一个踢面','级'],
  ['stair_tread','楼梯踏面深度','通道与楼梯','clear','设计建议','核对各级踏面与实际完成面'],
  ['stair_flight_width','梯段建模宽度','通道与楼梯','allocated','设计建议','这是梯段宽度，不是扶手间净宽'],
  ['stair_landing_depth','转弯平台深度','通道与楼梯','clear','设计建议','量最窄通行处，另核上下楼出口'],
  ['stair_gap','两梯段间距','通道与楼梯','clear','设计建议','两梯段相邻边缘之间'],
  ['guardrail_height','临空护栏高度','通道与楼梯','elevation','设计建议','从可踏完成面起算；本工具不判定规范达标'],
  ['stair_handrail_height','楼梯扶手高度','通道与楼梯','elevation','设计建议','注明量取基准；仍需专业复核'],
  ['door_height','默认门洞高度','门窗','opening','设计建议','每扇门分别复测，不等于成品门扇高度'],
  ['kitchen_south_window.west_offset','厨房南窗西侧偏移','门窗','offset','设计建议','从南墙西端到洞口西边；非净距默认值'],
  ['kitchen_south_window.width','厨房南窗洞宽','门窗','opening','设计建议','确认可开窗不代表 2.4 米洞宽已实测'],
  ['kitchen_south_window.sill','厨房南窗台标高','门窗','elevation','设计建议','相对厨房楼层基准面，不是窗扇尺寸'],
  ['kitchen_south_window.head','厨房南窗顶标高','门窗','elevation','设计建议','与窗台使用同一标高基准'],
  ['site_context.east_gap_mm','东侧邻界间距','邻房与日照','clear','用户约数','记录最近障碍物位置及高度，不只量空地宽度'],
  ['survey.diagonal_sw_ne','场地西南—东北对角线','边界','outer','缺失','与另一条对角线共同核对边界，不能由矩形公式冒充实测'],
  ['survey.diagonal_se_nw','场地东南—西北对角线','边界','outer','缺失','保留测点编号及照片'],
  ['survey.indoor_outdoor_level','室内外高差','标高与墙厚','elevation','缺失','有正负号；室内地面减院地标高'],
  ['survey.stair_headroom','楼梯最不利净空','通道与楼梯','clear','缺失','逐级、平台及梁下核对；现有平面数据不能证明'],
  ['survey.north_neighbor_top','北侧邻墙顶部标高','邻房与日照','elevation','缺失','与自家楼层采用同一基准，另绘遮挡轮廓'],
  ['survey.south_neighbor_top','南侧邻房顶部标高','邻房与日照','elevation','缺失','一层不等于已知高度；需檐口、屋脊和屋面轮廓'],
  ['survey.east_neighbor_top','东侧邻房顶部标高','邻房与日照','elevation','缺失','同时记录与房屋的相对位置'],
  ['survey.north_azimuth','图纸上方向的真北方位角','邻房与日照','angle','缺失','图纸朝北已确认；精确方位角尚未量取','°']
];
export const MEASUREMENT_FIELDS = Object.freeze(fields.map(([id,label,group,basis,status,method,unit='mm']) =>
  Object.freeze({id,label,group,basis,status,method,unit})));
export const MISSING_DECISIONS = Object.freeze([
  '精确位置、北向和邻房完整遮挡轮廓未齐，不能进行可信日照校核。',
  '屋顶形式、排水去向、梁柱与结构做法需结合现场及当地设计意见确定。',
  '每樘门窗的墙端定位、净洞口、窗台和开扇方式需逐一复测；建议洞口不等于成品尺寸。',
  '墙地顶饰面厚度及楼梯、梁下净空缺失，不能将扣墙估算用于家具下单或施工。'
]);
export const getValue = (object, path) => path.split('.').reduce((value,key) => value?.[key], object);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const point = value => Array.isArray(value) && value.length === 2 && value.every(finite);
const close = (a,b) => finite(a) && finite(b) && Math.abs(a-b) <= 0.01;
const same = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v,i) => Array.isArray(v) ? same(v,b[i]) : close(v,b[i]));
const bounds = polygon => [Math.min(...polygon.map(p=>p[0])),Math.min(...polygon.map(p=>p[1])),Math.max(...polygon.map(p=>p[0])),Math.max(...polygon.map(p=>p[1]))];
const validPolygon = polygon => Array.isArray(polygon) && polygon.length >= 3 && polygon.every(point);

/** Mirror scripts/geometry.py's contract, not a new stair design. */
export function expectedStair(p) {
  const right=p.site_width-p.exterior_wall_thickness-40;
  const turn=right-p.stair_landing_depth;
  const start=turn-(p.stair_risers/2-1)*p.stair_tread;
  const front=p.courtyard_depth+p.exterior_wall_thickness+180;
  const back=front+2*p.stair_flight_width+p.stair_gap;
  return {bounds:[start,front,right,back],upper_hole:[start,front-40,right,back+40],
    entry_x:start-p.stair_landing_depth,turn_x:turn,rise:p.floor_to_floor,
    riser_count:p.stair_risers,riser_height:p.floor_to_floor/p.stair_risers,
    tread_depth:p.stair_tread,flight_width:p.stair_flight_width,
    flight_clear_width:p.stair_flight_width-50,landing_depth:p.stair_landing_depth,gap:p.stair_gap};
}

/** Match the existing rectangular envelope estimate. No floor area is inferred. */
function clearBounds(space,walls,p) {
  const [x0,y0,x1,y1]=bounds(space.polygon), result=[x0,y0,x1,y1];
  for (const w of walls) {
    const [a,b,h]=[w.a,w.b,w.thickness/2];
    if (a[0]===b[0] && Math.min(a[1],b[1])<y1 && Math.max(a[1],b[1])>y0) {
      if(close(a[0],x0)) result[0]=Math.max(result[0],a[0]+h);
      if(close(a[0],x1)) result[2]=Math.min(result[2],a[0]-h);
      if(x0===0 && w.id==='west-house') result[0]=p.exterior_wall_thickness;
      if(x1===p.site_width && w.id==='east-house') result[2]=p.site_width-p.exterior_wall_thickness;
    }
    if(a[1]===b[1] && Math.min(a[0],b[0])<x1 && Math.max(a[0],b[0])>x0) {
      if(close(a[1],y0)) result[1]=Math.max(result[1],a[1]+h);
      if(close(a[1],y1)) result[3]=Math.min(result[3],a[1]-h);
      if(y0===p.courtyard_depth && w.id.startsWith('south-')) result[1]=p.courtyard_depth+p.exterior_wall_thickness;
      if(y1===p.courtyard_depth+p.house_depth && w.id==='north-house') result[3]=y1-p.exterior_wall_thickness;
    }
  }
  return result;
}

export function auditDimensions(parameters, plans) {
  const p=parameters && typeof parameters==='object' ? parameters : {};
  const issues=[], rooms=[], openings=[];
  const add=(code,message,level=null,entity=null) => issues.push({severity:'error',code,message,level,entity});
  const measurements=MEASUREMENT_FIELDS.map(field=>({...field,current:getValue(p,field.id)??null,field_verified:false}));
  const report=()=>({schema_version:AUDIT_VERSION,data_status:issues.length?'fail':'pass',
    model_status:'needs_review',scope:'parameters_and_plan_json_only',
    engineering_acceptance:'not_assessed',binary_models_checked:false,field_measurements_verified:0,
    issues,measurements,rooms,openings,missing_decisions:[...MISSING_DECISIONS]});
  if(p.units!=='mm') add('UNITS','house_parameters.json 必须明确使用 mm，不能默默把米当毫米。');
  for(const f of MEASUREMENT_FIELDS.filter(f=>!f.id.startsWith('survey.'))) {
    const value=getValue(p,f.id);
    const allowZero=['stair_gap','kitchen_south_window.west_offset','kitchen_south_window.sill'].includes(f.id);
    if(!finite(value) || (allowZero?value<0:value<=0)) add('PARAMETER',`${f.label}需要${allowZero?'非负':'正'}有限数值。`,null,f.id);
  }
  if(!Number.isInteger(p.stair_risers)||p.stair_risers<4||p.stair_risers%2!==0)
    add('STAIR_COUNT','当前等分折返楼梯需要不少于 4 的偶数踢面数，不能向下取整丢失一级。');
  if(issues.length) return report();
  const y0=p.courtyard_depth,y1=y0+p.house_depth,xe=p.site_width-p.east_bay_width;
  const yn=y1-p.north_room_depth,yk=yn-p.dining_depth-p.kitchen_depth;
  if(!close(p.wall_height+p.slab_thickness,p.floor_to_floor)) add('LEVEL_STACK','当前生成方式要求墙高＋楼板厚度＝层高，否则上下层之间会产生缺口或重叠。');
  if(xe<=p.west_bay_width||xe<=p.northwest_room_width+p.north_small_room_width||yk<=y0)
    add('PARTITION','分间尺寸之和挤占了厅堂、北排或门廊空间。');
  if(p.exterior_wall_thickness>=Math.min(p.west_bay_width,p.east_bay_width)/2 || p.interior_wall_thickness>=p.passage_clear_width)
    add('WALL_THICKNESS','墙厚与开间或通道不相容。');
  if(!(p.suite_entry_y>y0+p.master_bedroom_depth && p.suite_entry_y<yn)) add('SUITE_ENTRY','套间入口必须位于现有内廊范围内。');
  if(!Array.isArray(p.ensuite_floors)||p.ensuite_floors.length!==2||![1,2].every(n=>p.ensuite_floors.includes(n)))
    add('CONFIRMED_SUITE_PARAMETERS','当前已确认两层套卫，参数不能在未修订方案时取消。');
  const stair=expectedStair(p);
  if(stair.entry_x<=p.west_bay_width||stair.bounds[3]>=yk-p.interior_wall_thickness/2||stair.flight_clear_width<=0)
    add('STAIR_FIT','楼梯或上楼入口超出门廊可用范围。');
  if(!Array.isArray(plans)||plans.length!==2||![1,2].every(n=>plans.filter(pl=>pl?.level===n).length===1)) {
    add('FLOORS','需要恰好一份一层与一份二层平面数据。'); return report();
  }
  for(const plan of plans) {
    const level=plan.level;
    if(plan.units!=='mm'||plan.schema_version!==1) { add('PLAN_SCHEMA','平面数据版本或单位不支持。',level); continue; }
    if(!close(plan.elevation,(level-1)*p.floor_to_floor)) add('STALE_ELEVATION','楼层标高与参数不一致，请重新生成平面。',level);
    const boundary=[[0,level===1?0:y0],[p.site_width,level===1?0:y0],[p.site_width,y1],[0,y1]];
    if(!same(plan.property_boundary,boundary)) add('STALE_BOUNDARY','外边界与尺寸参数不一致。',level);
    const required=['walls','spaces','openings','connections','excluded_regions'];
    if(required.some(k=>!Array.isArray(plan[k]))) { add('PLAN_SCHEMA','缺少墙体、房间、门窗、连接或排除区域数组。',level); continue; }
    const maps={}; let malformed=false;
    for(const key of ['walls','spaces','openings','connections']) {
      const map=new Map(); maps[key]=map;
      for(const item of plan[key]) {
        if(!item||typeof item.id!=='string'||!item.id||map.has(item.id)) { add('ENTITY_ID',`${key} 存在空对象、缺少 ID 或重复 ID。`,level); malformed=true; continue; }
        map.set(item.id,item);
      }
    }
    for(const wall of maps.walls.values()) {
      if(!point(wall.a)||!point(wall.b)||!positive(wall.thickness)||!positive(wall.height)||same(wall.a,wall.b)) {
        add('WALL_GEOMETRY','墙体端点、长度、厚度或高度无效。',level,wall.id); malformed=true; continue;
      }
      if(wall.a[0]!==wall.b[0]&&wall.a[1]!==wall.b[1]) {add('WALL_DIRECTION','当前矩形尺寸估算不支持斜墙，需更新算法后再校核。',level,wall.id);malformed=true;}
      const thick=wall.class==='exterior'?p.exterior_wall_thickness:p.interior_wall_thickness;
      const expectedHeight=wall.id==='yard-screen'?1800:wall.id.startsWith('yard-')?p.courtyard_wall_height:wall.id.startsWith('annex-')?p.annex_height:p.wall_height;
      if(!close(wall.height,expectedHeight)) add('STALE_WALL_HEIGHT','墙体高度与当前生成规则不一致。',level,wall.id);
      if(!close(wall.thickness,thick)) add('STALE_WALL','墙厚与当前参数不一致。',level,wall.id);
    }
    if(malformed) continue;
    for(const [id,axis,value] of [['west-house',0,p.exterior_wall_thickness/2],['east-house',0,p.site_width-p.exterior_wall_thickness/2],['north-house',1,y1-p.exterior_wall_thickness/2]]) {
      const w=maps.walls.get(id);
      if(!w||!close(w.a[axis],value)||!close(w.b[axis],value)) add('STALE_WALL_POSITION','主体外墙定位与参数不一致。',level,id);
    }
    const byWall=new Map();
    for(const op of maps.openings.values()) {
      const wall=maps.walls.get(op.wall_id),sill=op.sill??0;
      if(!wall||!['door','window'].includes(op.kind)||!finite(op.offset)||op.offset<0||!positive(op.width)||!finite(sill)||sill<0||!positive(op.head)||op.head<=sill) {
        add('OPENING_DATA','洞口宿主、类型、尺寸或标高无效。',level,op.id); continue;
      }
      const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
      if(op.offset+op.width>length+.01||op.head>wall.height+.01) add('OPENING_BOUNDS','洞口超出宿主墙长度或墙顶。',level,op.id);
      if(op.kind==='door'&&!close(op.head,p.door_height)) add('STALE_DOOR_HEIGHT','门洞高度与默认参数不一致。',level,op.id);
      if(op.height!==undefined&&!close(op.height,op.head-sill)) add('OPENING_HEIGHT','洞高与窗顶减窗台不一致。',level,op.id);
      for(const other of byWall.get(wall.id)??[]) {
        if(Math.min(op.offset+op.width,other.offset+other.width)>Math.max(op.offset,other.offset)+.01 &&
           Math.min(op.head,other.head)>Math.max(sill,other.sill??0)+.01) add('OPENING_OVERLAP',`与洞口 ${other.id} 在同一墙上重叠。`,level,op.id);
      }
      byWall.set(wall.id,[...(byWall.get(wall.id)??[]),op]);
      openings.push({level,id:op.id,kind:op.kind,wall:op.wall_id,offset:op.offset,width:op.width,sill,head:op.head,height:op.head-sill,status:'设计建议／待实测'});
    }
    for(const space of maps.spaces.values()) {
      if(!validPolygon(space.polygon)) {add('SPACE_GEOMETRY','房间轮廓无效。',level,space.id);continue;}
      const b=bounds(space.polygon),nominal=[b[2]-b[0],b[3]-b[1]];
      if(space.polygon.length!==4||new Set(space.polygon.map(v=>v.join(','))).size!==4||space.polygon.some(v=>![b[0],b[2]].includes(v[0])||![b[1],b[3]].includes(v[1]))) {
        add('SPACE_GEOMETRY','非矩形房间不能沿用矩形净空估算。',level,space.id);continue;
      }
      const cb=clearBounds(space,plan.walls,p),clear=[cb[2]-cb[0],cb[3]-cb[1]];
      if(nominal.some(v=>v<=0)||clear.some(v=>v<=0)) add('SPACE_SIZE','房间存在零或负尺寸。',level,space.id);
      if(!same(space.nominal_size_mm,nominal)||!same(space.clear_bounds_mm,cb)||!Array.isArray(space.clear_size_mm)||space.clear_size_mm.length!==2||!space.clear_size_mm.every((v,i)=>finite(v)&&Math.abs(v-clear[i])<=.5))
        add('STALE_SPACE','房间缓存尺寸与墙体、轮廓不一致。',level,space.id);
      const expected={
        'master-bedroom':[p.west_bay_width,p.master_bedroom_depth],
        'bedroom-nw':[p.northwest_room_width,p.north_room_depth],
        'bedroom-ne':[p.east_bay_width,p.north_room_depth],
        'dining':[p.east_bay_width,p.dining_depth], 'kitchen':[p.east_bay_width,p.kitchen_depth],
        'north-small':[p.north_small_room_width,p.north_room_depth]
      }[space.id];
      if(expected&&!same(nominal,expected)) add('STALE_ROOM_PARAMETER','房间分配尺寸与当前参数不一致。',level,space.id);
      rooms.push({level,id:space.id,label:space.label??space.id,nominal_mm:nominal,estimated_clear_mm:clear,finished_clear_mm:null,
        note:'当前墙厚下的矩形范围估算；未扣柱、装饰层及局部障碍，非实测净尺寸。'});
    }
    if(!plan.stairs) add('STAIR_DATA','缺少楼梯数据。',level);
    else for(const [key,value] of Object.entries(stair)) if(Array.isArray(value)?!same(plan.stairs[key],value):!close(plan.stairs[key],value))
      add('STALE_STAIR',`楼梯 ${key} 与当前参数不一致。`,level,'stairs');
    const linked=(a,b,kind)=>plan.connections.some(c=>Array.isArray(c?.spaces)&&c.spaces.length===2&&c.spaces.includes(a)&&c.spaces.includes(b)&&(!kind||c.kind===kind));
    for(const c of maps.connections.values()) {
      if(!Array.isArray(c.spaces)||c.spaces.length!==2||c.spaces.some(id=>!maps.spaces.has(id))||!['door','open'].includes(c.kind)||
         (c.kind==='door'&&!maps.openings.has(c.opening_id))||
         (c.kind==='open'&&(!Array.isArray(c.segment)||c.segment.length!==2||!c.segment.every(point))))
        add('CONNECTION','空间连接引用无效。',level,c.id);
    }
    if(!linked('porch','stairwell','open')||linked('hall','stairwell')||['stair-west','south-stair'].some(id=>maps.walls.has(id)))
      add('CONFIRMED_CIRCULATION','门廊上楼、厅堂不直通楼梯、临院敞开的既定关系被改变。',level);
    if(!linked('west-passage','suite-passage','door')||!linked('suite-passage','bathroom-lower','door'))
      add('CONFIRMED_SUITE','两层套间入口或主卧卫浴关系被改变。',level);
    const suite=maps.walls.get('suite-entry-partition');
    if(!suite||!close(suite.a[1],p.suite_entry_y)||!close(suite.b[1],p.suite_entry_y)) add('STALE_SUITE','套间入口门轴线与参数不一致。',level);
    const passage=maps.spaces.get('suite-passage');
    if(!close(passage?.clear_size_mm?.[0],p.passage_clear_width)) add('PASSAGE','套间过道扣墙宽度与目标不一致。',level);
    if(level===1) {
      const screen=maps.walls.get('yard-screen'),annex=maps.walls.get('annex-west');
      if(!screen||!annex||!close(annex.a[0]-annex.thickness/2-screen.a[0]-screen.thickness/2,p.annex_passage_clear_width))
        add('ANNEX_PASSAGE','附属间门前净通道与目标不一致。',level);
      const kw=maps.openings.get('south-kitchen'),source=p.kitchen_south_window;
      if(!kw||kw.wall_id!=='stair-north'||kw.operation!==source.operation||
         !same([kw.offset,kw.width,kw.sill,kw.head],[source.west_offset,source.width,source.sill,source.head]))
        add('STALE_KITCHEN_WINDOW','厨房南窗与参数不一致或宿主墙错误。',level);
    } else {
      const voidRegion=plan.excluded_regions.find(r=>r?.id==='courtyard-airspace');
      if(p.upper_front_area!=='courtyard_void'||!voidRegion||voidRegion.kind!=='void'||!same(voidRegion.polygon,[[0,0],[p.site_width,0],[p.site_width,y0],[0,y0]]))
        add('COURTYARD_VOID','二层院子挑空的平面约束缺失或被改变。',level);
    }
  }
  return report();
}

/** Keep measurements separate from parameters; nothing here applies a model edit. */
export function validateMeasurement(record, fields=MEASUREMENT_FIELDS) {
  if(!record||typeof record!=='object'||Array.isArray(record)) return '记录必须是对象。';
  const field=fields.find(f=>f.id===record.id);
  if(!field) return '未知的测量项。';
  if(!finite(record.value)) return '实测值必须是有限数字。';
  if(field.unit==='级'&&(!Number.isInteger(record.value)||record.value<1)) return '数量必须是正整数。';
  if(field.unit==='°'&&(record.value<0||record.value>=360)) return '方位角必须在 0（含）到 360（不含）之间。';
  const zeroAllowed=field.basis==='offset'||field.id==='stair_gap';
  if(field.unit==='mm'&&field.basis!=='elevation'&&(zeroAllowed?record.value<0:record.value<=0)) return '长度必须为有效的非负值（通常大于零）。';
  if(!Object.hasOwn(BASIS_LABELS,record.basis)) return '请选择尺寸口径。';
  if(record.unit!==field.unit) return '单位不一致。';
  for(const key of ['recorder','reference']) if(typeof record[key]!=='string'||!record[key].trim()||record[key].length>500) return '需要填写测量人和测点／照片依据（各不超过 500 字）。';
  if(typeof record.note!=='string'||record.note.length>2000) return '备注必须是 2000 字以内的文本。';
  if(typeof record.measured_at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(record.measured_at)) return '需要有效测量日期。';
  const date=new Date(`${record.measured_at}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==record.measured_at) return '测量日期无效。';
  if(record.baseline_value!==null&&!finite(record.baseline_value)) return '记录的模型基准值无效。';
  return null;
}
export function measurementComparison(field,record) {
  if(!record) return {state:'missing',label:'未记录',delta:null};
  if(record.basis!==field.basis) return {state:'different_basis',label:'口径不同，不直接比较',delta:null};
  if(record.baseline_value!==field.current) return {state:'stale',label:'模型值已变化，需复核记录',delta:null};
  return {state:'recorded',label:'已记录，未应用',delta:finite(field.current)?record.value-field.current:null};
}
export function parseMeasurementFile(text) {
  if(typeof text!=='string'||text.length>1000000) throw new Error('记录文件过大或不是文本。');
  const packet=JSON.parse(text);
  if(packet?.schema_version!==1||!Array.isArray(packet.records)||packet.records.length>MEASUREMENT_FIELDS.length)
    throw new Error('不支持的记录格式或记录数量。');
  const seen=new Set();
  for(const record of packet.records) {
    const error=validateMeasurement(record);
    if(error) throw new Error(`${record?.id??'记录'}：${error}`);
    if(seen.has(record.id)) throw new Error('存在重复测量项，未导入任何记录。');
    seen.add(record.id);
  }
  return packet.records;
}
/** RFC-style quoting, BOM for Chinese Excel, and formula-injection protection. */
export function toCSV(rows) {
  const escape=value=>{
    let text=String(value??'');
    if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  return '\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
