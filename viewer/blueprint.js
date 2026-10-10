import {interiorLayout} from './interior-layout.js';
import {servicePoints} from './service-points.js';
import {doorLayout} from './door-layout.js';

export const escapeXML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const n=value=>Number(value.toFixed(4));
export function blueprintSVG(p,plan,{furnished=true,dimensions=true,zones=false,services=false,selected='',zoom=false}={}) {
  const layout=interiorLayout(p,plan),total=(p.courtyard_depth+p.house_depth)/1000,width=p.site_width/1000;
  const room=plan.spaces.find(r=>r.id===selected),b=room?.clear_bounds_mm.map(v=>v/1000);
  const view=zoom&&b?[b[0]-.8,total-b[3]-.85,b[2]-b[0]+1.6,b[3]-b[1]+2.05]:[-1.4,-1.7,width+3.3,total+3.7];
  const fs=zoom?.16:.4,parts=[];
  const tag=(name,attrs,content='')=>`<${name} ${Object.entries({...(name==='rect'?{'pointer-events':'none'}:{}),...attrs}).map(([k,v])=>`${k}="${escapeXML(v)}"`).join(' ')}>${content}</${name}>`;
  const text=(x,y,value,size=fs,color='#2e423a',anchor='middle')=>parts.push(tag('text',{x:n(x),y:n(y),'font-size':size,fill:color,'text-anchor':anchor},escapeXML(value)));
  const line=(x,y,x1,y1,color='#2a596e',stroke=.022,dash='')=>parts.push(tag('line',{x1:n(x),y1:n(y),x2:n(x1),y2:n(y1),stroke:color,'stroke-width':stroke,'stroke-dasharray':dash}));
  const rect=([x,y,x1,y1],fill,stroke='#b7c5c4',sw=.015,attrs={})=>parts.push(tag('rect',{x:n(x),y:n(total-y1),width:n(x1-x),height:n(y1-y),fill,stroke,'stroke-width':sw,...attrs}));
  const dimension=(x,y,x1,y1,label)=>{
    line(x,y,x1,y1);const horizontal=Math.abs(y-y1)<.001;
    for(const [a,q] of [[x,y],[x1,y1]])line(a-.06,q+.07,a+.06,q-.07);
    if(horizontal)text((x+x1)/2,(y+y1)/2-.09,label,fs*.86,'#2a596e');
    else {const tx=(x+x1)/2-.10,ty=(y+y1)/2;parts.push(tag('text',{x:n(tx),y:n(ty),'font-size':fs*.86,fill:'#2a596e','text-anchor':'middle',transform:`rotate(-90 ${n(tx)} ${n(ty)})`},escapeXML(label)));}
  };
  parts.push('<defs><pattern id="hatch" width=".14" height=".14" patternUnits="userSpaceOnUse"><path d="M0 .14L.14 0" stroke="#92b8ba" stroke-width=".012"/></pattern></defs>');
  parts.push(tag('rect',{x:view[0],y:view[1],width:view[2],height:view[3],fill:'#fff'}));
  text(view[0]+.13,view[1]+(zoom?.3:.52),`${plan.level} 层${zoom&&room?' · '+room.label:''} · ${furnished?'装修布置':'建筑空房'}尺寸图`,fs*1.35,'#2e423a','start');
  text(view[0]+.13,view[1]+(zoom?.56:.9),'方案尺寸 · 单位 mm · 未经现场复测',fs*.76,'#966625','start');
  if(zoom&&b)parts.push(`<defs><clipPath id="room-crop"><rect x="${b[0]-.2}" y="${total-b[3]-.2}" width="${b[2]-b[0]+.4}" height="${b[3]-b[1]+.4}"/></clipPath></defs><g clip-path="url(#room-crop)">`);
  if(plan.level===2){rect([0,0,width,p.courtyard_depth/1000],'#f2f5f1','#94a9a0',.025,{'stroke-dasharray':'.18 .12'});text(width/2,total-p.courtyard_depth/2000,'前院上方挑空 · 无楼板',.34,'#75867c');}
  for(const space of plan.spaces) {
    const bounds=space.clear_bounds_mm.map(v=>v/1000),wet=/bathroom|kitchen/.test(space.id);
    if(space.id==='courtyard')continue;
    rect(bounds,space.id===selected?'#e3eee3':furnished?(wet?'#edf1ef':plan.level===2?'#f1e8dc':'#f4f2ec'):'#fff','#d3ded8',.012,{'pointer-events':'all','data-room':space.id,role:'button',tabindex:0,'aria-label':`${space.label}，查看模型尺寸`});
  }
  for(const wall of plan.walls)line(wall.a[0]/1000,total-wall.a[1]/1000,wall.b[0]/1000,total-wall.b[1]/1000,'#53666b',wall.thickness/1000);
  for(const o of plan.openings) {
    const w=plan.walls.find(w=>w.id===o.wall_id),l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
    const at=t=>[(w.a[0]+(w.b[0]-w.a[0])*t/l)/1000,total-(w.a[1]+(w.b[1]-w.a[1])*t/l)/1000];
    const [a,b1]=[at(o.offset),at(o.offset+o.width)];
    line(...a,...b1,'#fff',w.thickness/1000+.008);
    if(o.kind==='window')line(...a,...b1,'#3e8399',.055);
    else line(...a,...b1,'#b59d77',.015,'.07 .05');
  }
  if(furnished)for(const item of layout.items) {
    const [x,y,x1,y1]=item.bounds;
    if(item.type==='kitchen') {
      rect([x,y1-item.depth,x1,y1],'#d8c5aa');rect([x1-item.depth,y,x1,y1-item.depth],'#d8c5aa');
    } else if(item.type==='shower')rect(item.bounds,'#e1eef0','#72a2b0');
    else if(item.type==='bed') {
      rect(item.bounds,'#e4ded1','#a89f8d');rect([x,y1-.11,x1,y1],'#bfa889');
      for(const a of [x+.12,(x+x1)/2+.08])rect([a,y1-.48,a+(x1-x-.42)/2,y1-.13],'#fff');
    } else rect(item.bounds,['toilet','vanity','fridge'].includes(item.type)?'#fdfefd':['coffee-table','dining-set'].includes(item.type)?'#d1b896':'#cebb9d');
    if(item.type==='dining-set')for(const a of [(x+x1)/2-.43,(x+x1)/2+.43])for(const q of [(y+y1)/2-.68,(y+y1)/2+.68])rect([a-.23,q-.23,a+.23,q+.23],'#d9cfbb');
  }
  if(zones)for(const zone of layout.zones.filter(z=>!selected||z.space===selected))rect(zone.bounds,'url(#hatch)','#579294',.017,{'stroke-dasharray':'.10 .06'});
  for(const door of doorLayout(p,plan)) {
    const [x,y,x1,y1]=door.bounds,[px,py]=door.pivot,horizontal=x1-x>y1-y;
    const tx=horizontal?(Math.abs(px-x)<.01?x1:x):px,ty=horizontal?py:(Math.abs(py-y)<.01?y1:y);
    const points=Array.from({length:19},(_,i)=>{const a=door.amount*i/18,dx=tx-px,dy=ty-py;return [px+dx*Math.cos(a)-dy*Math.sin(a),total-py-dx*Math.sin(a)-dy*Math.cos(a)];});
    parts.push(tag('polyline',{points:points.map(v=>v.map(n).join(',')).join(' '),fill:'none',stroke:'#8d9d91','stroke-width':.017,'stroke-dasharray':'.045 .035','pointer-events':'none'}));
    line(px,total-py,...points.at(-1),'#587967',.035);
  }
  const s=plan.stairs,[sx,sy,ex,ey]=s.bounds.map(v=>v/1000),turn=s.turn_x/1000,fw=s.flight_width/1000;
  rect([sx,sy,ex,ey],'none','#7a8e8d',.022);
  for(let i=0;i<s.riser_count/2;i++)for(const [y,y1] of [[sy,sy+fw],[ey-fw,ey]])line(sx+i*(turn-sx)/(s.riser_count/2-1),total-y,sx+i*(turn-sx)/(s.riser_count/2-1),total-y1,'#829793',.02);
  line(sx+.15,total-sy-fw/2,turn+.42,total-sy-fw/2,'#4c7771',.025);
  line(turn+.42,total-sy-fw/2,turn+.42,total-ey+fw/2,'#4c7771',.025);
  line(turn+.42,total-ey+fw/2,sx+.15,total-ey+fw/2,'#4c7771',.025);
  text(sx+.38,total-ey+fw/2-.11,plan.level===1?'← 上':'→ 下',fs*.8,'#4c7771');
  for(const space of plan.spaces) {
    if(['stairwell','west-passage','suite-passage','east-vestibule','porch'].includes(space.id))continue;
    const [x,y,x1,y1]=space.clear_bounds_mm.map(v=>v/1000),cx=space.id==='courtyard'?4:(x+x1)/2,cy=space.id==='courtyard'?total-3:(total-(y+y1)/2);
    const size=Math.min(fs,(x1-x)/5);
    text(cx,cy,space.label,size);
    if(dimensions&&space.id!=='courtyard')text(cx,cy+size*1.35,`${Math.round((x1-x)*1000)} × ${Math.round((y1-y)*1000)}`,size*.76,'#486c78');
  }
  if(services)servicePoints(layout).filter(v=>!selected||v.space===selected).forEach((v,i)=>{
    const [x,y]=v.position;parts.push(tag('circle',{cx:x,cy:total-y,r:fs*.43,fill:'#b47830'}));text(x,total-y+fs*.25,i+1,fs*.68,'#fff');
  });
  if(zoom&&b)parts.push('</g>');
  if(dimensions) {
    if(zoom&&b) {dimension(b[0],total-b[1]+.45,b[2],total-b[1]+.45,Math.round((b[2]-b[0])*1000));dimension(b[2]+.45,total-b[3],b[2]+.45,total-b[1],Math.round((b[3]-b[1])*1000));}
    else {
      dimension(0,-.48,width,-.48,p.site_width);dimension(width+.9,0,width+.9,total,p.house_depth+p.courtyard_depth);
      dimension(width+.43,0,width+.43,p.house_depth/1000,p.house_depth);dimension(width+.43,p.house_depth/1000,width+.43,total,p.courtyard_depth);
      const splits=[0,p.west_bay_width/1000,(p.site_width-p.east_bay_width)/1000,width];
      for(let i=0;i<splits.length-1;i++)dimension(splits[i],total+.45,splits[i+1],total+.45,Math.round((splits[i+1]-splits[i])*1000));
    }
  }
  if(!zoom)text(-.6,.3,'北 ↑',.28,'#2a596e');
  text(view[0]+.13,view[1]+view[3]-.52,zoom?'模型净界，饰面与突出另核。':'外圈：含墙控制尺寸；房间：扣墙模型净界；饰面与突出另核。',fs*.66,'#687a71','start');
  text(view[0]+.13,view[1]+view[3]-.18,zoom?'方案值待复测，非施工图。':'门扇显示暂定开启方向。家具、接点为方案值，不能据此施工或下单。',fs*.66,'#966625','start');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.map(n).join(' ')}" role="group" aria-label="${plan.level}层装修尺寸图" font-family="Microsoft YaHei, PingFang SC, sans-serif"><title>${plan.level}层装修方案尺寸图，非施工图</title>${parts.join('')}</svg>`;
}
