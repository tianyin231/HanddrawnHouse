// 所有坐标为米，平面 X 向东、Y 向北。家具规格是方案值，房间净界来自平面数据。
export function interiorLayout(p, plan) {
  const rooms=plan.spaces.filter(s=>!['courtyard','porch','stairwell','annex-south','annex-north'].includes(s.id))
    .map(s=>({id:s.id,label:s.label,use:s.use,bounds:s.clear_bounds_mm.map(v=>v/1000),polygon:s.polygon.map(a=>a.map(v=>v/1000))}));
  const room=id=>rooms.find(r=>r.id===id);
  const items=[],zones=[],lights=[];
  const add=(space,type,id,bounds,options={})=>items.push({space,type,id,bounds,...options});
  const zone=(space,id,label,bounds)=>zones.push({space,id,label,bounds});
  const hall=room('hall'), [hx,hy,hx1]=hall.bounds;
  add('hall','sofa','hall-sofa',[hx1-1,hy+.66,hx1-.05,hy+3.56]);
  add('hall','coffee-table','hall-table',[hx1-2.93,hy+1.61,hx1-1.85,hy+2.58]);
  add('hall','tv-cabinet','hall-tv',[hx+.03,hy+.68,hx+.50,hy+3.1],{facing:'east'});
  add('hall','floor-lamp','hall-lamp',[hx1-.50,hy+.15,hx1-.10,hy+.55]);
  add('hall','storage-cabinet','hall-storage',[hx1-.40,hy+3.67,hx1-.04,hy+4.18],{facing:'west',height:2.08,closedHeight:.79});
  add('hall','wall-art','hall-art',[hx1-.058,hy+1.15,hx1-.025,hy+3.08],{bottom:1.43,height:.90});
  zone('hall','hall-storage-use','立柜前预留',[hx1-1.15,hy+3.67,hx1-.45,hy+4.18]);
  zone('hall','hall-east','沙发前通道',[hx1-1.80,hy+.80,hx1-1.04,hy+3.50]);
  zone('hall','hall-entry','厅堂入门',[hx+1.7,hy,hx+3.7,hy+.80]);
  zone('hall','hall-north','北侧房间通道',[hx+.05,hy+4.33,hx1-.04,hall.bounds[3]-.02]);

  const master=room('master-bedroom'), [mx,my,mx1,my1]=master.bounds;
  add(master.id,'bed','master-bed',[mx+.71,my+1.86,mx+2.51,my+3.86]);
  add(master.id,'nightstand','master-nightstand',[mx+.16,my+3.24,mx+.60,my+3.81]);
  add(master.id,'wardrobe','master-wardrobe',[mx1-.60,my+.34,mx1-.01,my+1.78],{facing:'west'});
  zone(master.id,'master-route','通往套内过道',[mx+2.68,my+1.85,mx1-.05,my1]);
  zone(master.id,'master-wardrobe-use','衣柜前预留',[mx1-1.42,my+.34,mx1-.64,my+1.78]);

  for(const id of ['bedroom-nw','bedroom-ne','bedroom-middle','bedroom-east']) {
    const r=room(id);if(!r)continue;
    const [x,y,x1,y1]=r.bounds;
    const eastDoor=['bedroom-nw','bedroom-middle'].includes(id);
    const bx=eastDoor?x+.55:x1-2.19, by=y1-2.16;
    add(id,'bed',`${id}-bed`,[bx,by,bx+1.5,by+2]);
    add(id,'nightstand',`${id}-nightstand`,[bx-.51,y1-.66,bx-.07,y1-.16]);
    add(id,'wardrobe',`${id}-wardrobe`,[eastDoor?x+.10:x1-2.29,y+.07,eastDoor?x+2.00:x1-.06,y+.67],{facing:'north'});
    zone(id,`${id}-wardrobe-use`,'衣柜前预留',[eastDoor?x+.10:x1-2.29,y+.71,eastDoor?x+2.00:x1-.06,by-.06]);
    const door=plan.openings.find(o=>o.id===({'bedroom-nw':'nw-bedroom-door','bedroom-ne':'ne-bedroom-door','bedroom-middle':'middle-bedroom-door','bedroom-east':'east-bedroom-door'}[id]));
    const host=plan.walls.find(w=>w.id===door.wall_id);
    const dx=(host.a[0]+door.offset)/1000;
    zone(id,`${id}-entry`,'卧室入门',[dx+.03,host.a[1]/1000<y+.1?y:y1-.8,dx+door.width/1000-.03,host.a[1]/1000<y+.1?y+.8:y1]);
  }

  for(const id of ['bathroom-lower','bathroom-upper']) {
    const [x,y,x1,y1]=room(id).bounds;
    add(id,'shower',`${id}-shower`,[x+.025,y+.025,x+1.02,y1-.025]);
    add(id,'vanity',`${id}-vanity`,[x+1.31,y+.04,x+2.01,y+.49]);
    add(id,'toilet',`${id}-toilet`,[x1-.72,y1-.40,x1-.025,y1-.02],{facing:'west'});
    zone(id,`${id}-vanity-use`,'洗手盆前预留',[x+1.31,y+.53,x+2.01,y+1.25]);
    zone(id,`${id}-toilet-use`,'坐便器前预留',[x+1.07,y1-.57,x1-.76,y1-.02]);
  }

  if(plan.level===1) {
    const [x,y,x1,y1]=room('kitchen').bounds;
    add('kitchen','kitchen','kitchen-counters',[x+.025,y+.025,x1-.025,y1-.225],{depth:.60,corner:'southwest'});
    zone('kitchen','kitchen-west-work','灶台前预留',[x+.68,y+.72,x+1.55,y1-.24]);
    zone('kitchen','kitchen-south-work','水槽前预留',[x+1.60,y+.68,x1-.05,y+1.55]);
    const d=room('dining').bounds,tx=d[2]-1.425,ty=d[1]+.63;
    add('dining','fridge','kitchen-fridge',[d[0]+1.24,d[3]-.735,d[0]+1.91,d[3]-.05]);
    add('dining','dining-set','dining-table',[tx,ty,tx+1.4,ty+.75]);
    add('dining','storage-cabinet','dining-sideboard',[d[0]+.035,d[1]+.18,d[0]+.40,d[1]+1.36],{facing:'east',height:.92,closedHeight:.70});
    zone('dining','dining-sideboard-use','餐边柜前预留',[d[0]+.45,d[1]+.18,d[0]+1.18,d[1]+1.36]);
    zone('dining','dining-entry','餐厨入口及卧室通道',[d[0]+.02,d[1]+1.82,d[0]+1.17,d[3]-.03]);
    zone('dining','dining-fridge-use','冰箱前预留',[d[0]+1.21,d[3]-1.52,d[0]+1.99,d[3]-.78]);
    zone('dining','dining-south-seat','南侧椅后空间',[tx,d[1]-.36,tx+1.4,ty-.56]);
    zone('dining','dining-north-seat','北侧椅后空间',[tx,ty+1.31,tx+1.4,d[3]-.03]);
  }
  const living=room('north-living');
  if(living) {
    const [x,y,x1,y1]=living.bounds;
    add(living.id,'kitchen','upper-kitchen-counters',[x+.025,y+1,x+3.025,y1-.025],{depth:.60,corner:'northwest'});
    add(living.id,'fridge','upper-kitchen-fridge',[x+3.29,y1-.735,x+3.96,y1-.05]);
    add(living.id,'dining-set','upper-dining-table',[x1-1.475,y+1.30,x1-.025,y+2.10]);
    zone(living.id,'living-entry','餐厨南侧通道',[x+.05,y+.05,x1-.05,y+.72]);
    zone(living.id,'upper-kitchen-west-work','灶台前预留',[x+.70,y+1.02,x+1.54,y1-.68]);
    zone(living.id,'upper-kitchen-sink-work','水槽前预留',[x+1.60,y1-1.48,x+2.96,y1-.68]);
    zone(living.id,'upper-fridge-use','冰箱前预留',[x+3.26,y1-1.55,x+4.04,y1-.78]);
    zone(living.id,'upper-dining-north','餐椅后预留',[x1-1.475,y+2.65,x1-.025,y1-.03]);
  }
  for(const r of rooms) {
    if(['north-small','east-small'].includes(r.id))continue;
    const [x,y,x1,y1]=r.bounds;
    lights.push({space:r.id,position:[(x+x1)/2,(y+y1)/2,p.wall_height/1000-.075],power:r.id==='hall'?32:18});
  }
  return {rooms,items,zones,lights,level:plan.level,styleStatus:'provisional',floorTop:.024,
    unfinishedUses:rooms.filter(r=>['north-small','east-small'].includes(r.id)).map(r=>r.id)};
}

export function interiorViewpoint(p,plan,id) {
  const s=plan.spaces.find(s=>s.id===id), b=s.clear_bounds_mm.map(n=>n/1000);
  const [x,y,x1,y1]=b;
  const presets={
    hall:[[x+1.01,y+.37,1.58],[x1-1.5,y+2.71,1.05]],
    'master-bedroom':[[x+.40,y+.61,1.55],[x+1.86,y+2.96,1]],
    kitchen:[[x+1.60,y+3.45,1.62],[x+1.78,y+.85,1.05]],
    dining:[[x+.25,y+.23,1.58],[(x+x1)/2,(y+y1)/2,.82]],
    'bathroom-lower':[[x1-.16,y+.87,1.55],[x+.72,y+.92,1.05]],
    'bathroom-upper':[[x1-.16,y+1.22,1.55],[x+.72,y+1.10,1.05]],
    'north-living':[[x1-1.9,y+.22,1.58],[x+1.7,y+2.5,1.05]],
  };
  const eastDoor=['bedroom-nw','bedroom-middle'].includes(id);
  const fallback=[[eastDoor?x1-.35:x+.35,y+.7,1.58],[(x+x1)/2,y1-1.2,.95]];
  const [eye,target]=presets[id]||fallback;
  const world=([a,b,h])=>[a,h+(plan.level-1)*p.floor_to_floor/1000,-b];
  return {eye:world(eye),target:world(target),label:s.label};
}
