import {interiorLayout} from './interior-layout.js';
import {yardElevationAt,siteLayout} from './site-layout.js';
import {courtyardLayout} from './courtyard-design.js';

export const BODY_RADIUS=.22,EYE_HEIGHT=1.65;
export const rectangle=([x,y,x1,y1])=>[[x,y],[x1,y],[x1,y1],[x,y1]];
const inside=([x,y,x1,y1],a,b,pad=0)=>a>=x+pad&&a<=x1-pad&&b>=y+pad&&b<=y1-pad;

export function overlap(a,b) {
  if(a.top<=b.bottom+.004||b.top<=a.bottom+.004)return false;
  for(const polygon of [a.polygon,b.polygon])for(let i=0;i<polygon.length;i++) {
    const p=polygon[i],q=polygon[(i+1)%polygon.length],axis=[p[1]-q[1],q[0]-p[0]],length=Math.hypot(...axis);
    const project=poly=>poly.map(v=>(v[0]*axis[0]+v[1]*axis[1])/length);
    const aa=project(a.polygon),bb=project(b.polygon);
    if(Math.max(...aa)<=Math.min(...bb)+.004||Math.max(...bb)<=Math.min(...aa)+.004)return false;
  }
  return true;
}

export function touchesBody(obstacle,x,y,z,r=BODY_RADIUS) {
  if(obstacle.top<=z+.08||obstacle.bottom>=z+1.8)return false;
  // 八边形近似人体占位，半径是浏览体验参数，不是无障碍或净宽验收值。
  const polygon=Array.from({length:8},(_,i)=>[x+Math.cos(i*Math.PI/4)*r,y+Math.sin(i*Math.PI/4)*r]);
  return overlap(obstacle,{polygon,bottom:z+.08,top:z+1.8});
}

export function gateObstacles(p,plan,open) {
  const gate=siteLayout(p,plan).gate;
  return gate.hinges.map(([x,y],i)=>{
    const angle=open?gate.openAngles[i]:0,sign=i===0?1:-1;
    const polygon=rectangle([-.04,Math.min(0,sign*gate.leafWidth),.04,Math.max(0,sign*gate.leafWidth)])
      .map(([a,b])=>[x+a*Math.cos(angle)-b*Math.sin(angle),y+a*Math.sin(angle)+b*Math.cos(angle)]);
    return {polygon,bottom:gate.elevation,top:gate.elevation+gate.height,owner:'yard-gate',label:'院门'};
  });
}

export function createWalkWorld(p,plans) {
  const obstacles=[],rise=p.floor_to_floor/1000,d=p.courtyard_depth/1000;
  const box=(bounds,bottom,top,owner,label)=>obstacles.push({polygon:rectangle(bounds),bottom,top,owner,label});
  for(const plan of plans) {
    const base=(plan.level-1)*rise;
    for(const w of plan.walls) {
      const horizontal=w.a[1]===w.b[1],length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])/1000;
      const holes=plan.openings.filter(o=>o.wall_id===w.id&&o.kind==='door').map(o=>[o.offset/1000,(o.offset+o.width)/1000]).sort((a,b)=>a[0]-b[0]);
      const z=base-(plan.level===1&&/^(yard-|annex-)/.test(w.id)?p.entrance_proposal.yard_drop_mm/1000:0),t=w.thickness/2000;
      let start=0;
      for(const [end,next] of [...holes,[length,length]]) {
        if(end>start) {
          const x=w.a[0]/1000,y=w.a[1]/1000;
          box(horizontal?[x+start,y-t,x+end,y+t]:[x-t,y+start,x+t,y+end],z,z+w.height/1000,`wall/${plan.level}/${w.id}`,'墙体');
        }
        start=next;
      }
    }
    for(const item of interiorLayout(p,plan).items) {
      const [x,y,x1,y1]=item.bounds,owner=`${plan.level}:${item.id}`;
      const add=(bounds,height=1,bottom=.024,id=owner)=>box(bounds,base+bottom,base+height,id,'家具');
      switch(item.type) {
        case 'kitchen':
          add([x,y1-item.depth,x1-item.depth,y1],.855,.10,owner+'/cabinet-0');
          add([x1-item.depth,y,x1,y1],.855,.10,owner+'/cabinet-1');break;
        case 'shower':add([x1-.02,y+.87,x1+.006,y1],2.05);break;
        case 'dining-set':
          add(item.bounds,.77);for(const a of [(x+x1)/2-.43,(x+x1)/2+.43])for(const q of [(y+y1)/2-.68,(y+y1)/2+.68])add([a-.23,q-.23,a+.23,q+.23],.86);break;
        case 'desk':add(item.bounds,.76);add([(x+x1)/2-.23,y-.54,(x+x1)/2+.23,y-.08],.86);break;
        case 'reading-set':
          for(const a of [x+.4,x+1.62])add([a-.34,y1-.81,a+.34,y1-.04],.88);
          add([x+.69,y+.11,x+1.37,y+.79],.461);break;
        case 'wardrobe':add(item.bounds,2.376,.026,owner+'/cabinet-0');break;
        case 'vanity':add(item.bounds,.91,.26,owner+'/cabinet-0');break;
        default:add(item.bounds,{bed:1.06,nightstand:.48,fridge:1.88,'floor-lamp':1.65,'coffee-table':.39,'tv-cabinet':.44,toilet:.78,sofa:.94}[item.type]||1);
      }
    }
    const site=siteLayout(p,plans[0]);
    for(const x of site.columns)box([x-site.columnWidth/2,site.porchY-site.columnWidth/2,x+site.columnWidth/2,site.porchY+site.columnWidth/2],base,base+3,`column/${plan.level}`,'门廊柱');
  }
  const garden=courtyardLayout(p,plans[0]);
  for(const bed of garden.beds)box(bed.bounds,-.6,0,bed.id,'花池');
  box([3.46,d-2.99,4.16,d-2.39],-.45,.4,'yard-chair','庭院座椅');
  box([2.95,d-1.24,4.93,d-.64],-.45,.52,'yard-bench','庭院坐凳');
  box([3.52,d-2.45,4.38,d-1.59],-.45,.3,'yard-table','庭院茶几');
  const s=plans[0].stairs,[sx,sy,ex,ey]=s.bounds.map(v=>v/1000),turn=s.turn_x/1000,fw=s.flight_width/1000,n=s.riser_count/2;
  // 护栏分别沿两跑和中平台布置。中间缝不能横跨，二层只从上跑西端进出。
  for(const y of [sy,sy+fw,ey-fw,ey])box([sx,y-.025,turn,y+.025],0,rise+1.05,'stair-rail','楼梯栏杆');
  for(const y of [sy,ey])box([turn,y-.025,ex,y+.025],rise/2-.04,rise/2+1.05,'landing-rail','平台栏杆');
  box([ex-.025,sy,ex+.025,ey],rise/2,rise/2+1.05,'landing-east','平台栏杆');
  box([sx-.025,sy-.04,sx+.025,sy+fw-.04],rise,rise+1.05,'upper-west','二层楼梯口栏杆');
  box([p.west_bay_width/1000+.1,d+.1,p.site_width/1000-.24,d+.14],rise,rise+1.05,'porch-guard','二层门廊栏杆');
  const e=p.entrance_proposal,cx=e.center_x_mm/1000,hw=e.width_mm/2000,landing=d-e.landing_outside_mm/1000;
  const start=landing-(e.riser_count-1)*e.tread_mm/1000,drop=e.yard_drop_mm/1000;
  for(const x of [cx-hw+.045,cx+hw-.045])box([x-.025,start+.12,x+.025,landing+.15],-.3,.9,'entrance-rail','台阶扶手');
  const stairAt=(x,y)=>{
    if(!inside([sx,sy,ex,ey],x,y))return null;
    if(x>=turn)return rise/2;
    const step=(turn-sx)/(n-1);
    if(y<=sy+fw)return Math.min(n,Math.floor((x-sx)/step)+1)*rise/(n*2);
    if(y>=ey-fw)return rise/2+Math.min(n,Math.floor((turn-x)/step)+1)*rise/(n*2);
    return null;
  };
  function surface(x,y,previous) {
    if(x<BODY_RADIUS||x>p.site_width/1000-BODY_RADIUS||y<BODY_RADIUS||y>(p.courtyard_depth+p.house_depth)/1000-BODY_RADIUS)return null;
    const candidates=[],stair=stairAt(x,y);
    if(y<d) {
      if(x>=cx-hw&&x<=cx+hw&&y>=start)candidates.push(-drop+Math.min(e.riser_count,Math.floor((y-start)/(e.tread_mm/1000))+1)*drop/e.riser_count);
      else candidates.push(x>=10.7&&y<=4?-drop:yardElevationAt(p,y)+.03);
    } else {
      if(stair===null||stair>=1.98)candidates.push(.024);
      if(!inside(s.upper_hole.map(v=>v/1000),x,y))candidates.push(rise+.024);
    }
    if(stair!==null)candidates.push(stair);
    const possible=candidates.filter(z=>Math.abs(z-previous)<=.205);
    return possible.length?possible.sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous))[0]:null;
  }
  function move(position,dx,dy,dynamic=[]) {
    let pos={...position};const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.045));
    const allowed=(x,y)=>{const z=surface(x,y,pos.z);return z!==null&&!obstacles.concat(dynamic).some(o=>touchesBody(o,x,y,z))?z:null;};
    for(let i=0;i<steps;i++) {
      const x=pos.x+dx/steps,y=pos.y+dy/steps,z=allowed(x,y);
      if(z!==null){pos={x,y,z};continue;}
      const zx=allowed(x,pos.y);if(zx!==null)pos={x,y:pos.y,z:zx};
      const zy=allowed(pos.x,y);if(zy!==null)pos={x:pos.x,y,z:zy};
    }
    return pos;
  }
  return {obstacles,surface,move,stairAt};
}
