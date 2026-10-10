import {yardElevationAt} from './site-layout.js';
import {courtyardLayout} from './courtyard-layout.js';

// 坐标为所属楼层的东、北、高；楼梯灯随一层楼梯实体保存，部分高度跨入二层。
export function circulationLayout(p,plan) {
  const items=[],level=plan.level,d=p.courtyard_depth/1000,h=p.wall_height/1000;
  const add=(id,space,name,group,x,y,bottom,target,mount=null)=>items.push({id:`${level}:${id}`,level,space,name,group,
    bounds:[x-.09,y-.045,x+.09,y+.045],bottom,height:.045,position:[x,y,bottom-.014],target,mount,
    previewIntensity:group==='porch'?24:id==='gate'?14:5,status:'preview_photometry_pending',
    control:group==='porch'?'门廊灯独立分组；楼梯上下口保留手动控制意图':'台阶与楼梯分组；上下口手动控制，感应仅作待选辅助'});
  add('porch','porch','门廊顶灯','porch',6.45,d+1.52,h-.045,[6.45,d+1.52,.025]);
  add('stair-entry','stairwell','楼梯口顶灯','porch',plan.stairs.entry_x/1000+.45,d+1.20,h-.045,[plan.stairs.entry_x/1000+.45,d+1.20,.025]);
  if(level===1) {
    const e=p.entrance_proposal,landing=d-e.landing_outside_mm/1000;
    const cx=e.center_x_mm/1000,half=e.width_mm/2000;
    for(const sign of [-1,1]) {
      const post=cx+sign*(half-.045),x=post+sign*.07,y=landing+.15;
      add(`entry-${sign<0?'west':'east'}`,'courtyard','入户台阶栏杆灯','path',x,y,.53,[post-sign*.36,landing-e.tread_mm/2000,-e.yard_drop_mm/1000/e.riser_count+.015],[post,y,.55]);
    }
    const s=plan.stairs,[x0,y0,x1,y1]=s.bounds.map(v=>v/1000),turn=s.turn_x/1000,rise=p.floor_to_floor/1000;
    const n=s.riser_count/2,riser=rise/s.riser_count,tread=(turn-x0)/(n-1);
    // 支架固定在竖杆上，发光面错开杆件，避免灯向梯内照射时被竖杆挡住。
    const segments=Math.ceil(Math.hypot(turn-x0,rise/2-riser)/.12);
    for(const upper of [false,true])for(const f of [.32,.72]) {
      const t=Math.round(segments*f)/segments,post=upper?turn-(turn-x0)*t:x0+(turn-x0)*t,x=post+.05;
      const distance=upper?turn-x:x-x0;
      const surface=(upper?rise/2:0)+Math.min(n,Math.floor(distance/tread)+1)*riser;
      const railY=upper?y1:y0,y=railY+(upper?.07:-.07);
      add(`stair-${upper?'upper':'lower'}-${f}`,'stairwell',`${upper?'上':'下'}跑栏杆灯`,'path',x,y,surface+.53,
        [x,railY+(upper?-.36:.36),surface+.015],[post,railY,surface+.55]);
    }
    add('landing','stairwell','转弯平台栏杆灯','path',(turn+x1)/2+.05,y1+.07,rise/2+.53,
      [(turn+x1)/2+.05,y1-.38,rise/2+.015],[(turn+x1)/2,y1,rise/2+.55]);
    const gateBottom=2.10-e.yard_drop_mm/1000;
    add('gate','courtyard','院门门头灯','path',.20,2,gateBottom-.045,[.38,2,yardElevationAt(p,2)+.025]);
  }
  const door=plan.openings.find(o=>o.id==='main-hall-door'),wall=plan.walls.find(w=>w.id===door.wall_id);
  const existing=[{id:`${level}:existing-hall-door`,level,space:'porch',name:'原有入户门灯',group:'porch',
    position:[(wall.a[0]+door.offset+door.width/2)/1000,(wall.a[1]-wall.thickness/2)/1000-.18,2.39],control:'门廊分组',source:'existing_facade_fixture'}];
  if(level===1)for(const [index,[x,y,z]] of courtyardLayout(p,plan).lights.entries())existing.push({id:`1:existing-yard-${index}`,level,space:'courtyard',name:'原有庭院灯',group:'garden',
    position:[x,y,z+.05+yardElevationAt(p,y)],control:'庭院氛围灯分组',source:'existing_courtyard_fixture'});
  return {level,status:'proposal_not_engineered',items,existing,
    checks:['灯体、安装高度和控制分组为候选；未选定功率、配光、防护等级和线缆。',
      '室外灯具、接线盒及穿线固定需按暴露环境和产品资料确认；栏杆灯不在扶手握持面开孔。',
      '通行照明需核对踏面、首末级、平台和门锁处的实际照度与眩光；当前画面不能作验收。']};
}
