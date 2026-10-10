// 所有坐标为米，平面 X 向东、Y 向北。家具规格是方案值，房间净界来自平面数据。
export function interiorLayout(p, plan) {
  const rooms=plan.spaces.filter(s=>!['courtyard','porch','stairwell','annex-south','annex-north'].includes(s.id))
    .map(s=>({id:s.id,label:s.label,bounds:s.clear_bounds_mm.map(v=>v/1000),polygon:s.polygon.map(a=>a.map(v=>v/1000))}));
  const room=id=>rooms.find(r=>r.id===id);
  const items=[],zones=[],lights=[];
  const add=(space,type,id,bounds,options={})=>items.push({space,type,id,bounds,...options});
  const zone=(space,id,label,bounds)=>zones.push({space,id,label,bounds});
  const hall=room('hall'), [hx,hy,hx1]=hall.bounds;
  add('hall','sofa','hall-sofa',[hx+4.36,hy+.66,hx+5.31,hy+3.56]);
  add('hall','coffee-table','hall-table',[hx+2.55,hy+1.61,hx+3.63,hy+2.58]);
  add('hall','tv-cabinet','hall-tv',[hx+.03,hy+.68,hx+.50,hy+3.1],{facing:'east'});
  add('hall','floor-lamp','hall-lamp',[hx+4.45,hy+3.86,hx+4.85,hy+4.26]);
  zone('hall','hall-east','沙发后通道',[hx+5.35,hy+.12,hx1-.04,hy+5.10]);
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
    add('kitchen','fridge','kitchen-fridge',[x+.06,y1-.71,x+.73,y1-.025]);
    add('kitchen','kitchen','kitchen-counters',[x+.79,y+.22,x1-.025,y1-.025],{depth:.60});
    zone('kitchen','kitchen-north-work','北台面前预留',[x+.82,y1-1.53,x1-.66,y1-.66]);
    zone('kitchen','kitchen-east-work','水槽前预留',[x1-1.51,y+.22,x1-.66,y1-.65]);
    zone('kitchen','kitchen-entry','厨房入门',[x+.02,y+.59,x+.77,y+1.49]);
    const d=room('dining').bounds, cx=(d[0]+d[2])/2, cy=(d[1]+d[3])/2;
    add('dining','dining-set','dining-table',[cx-.70,cy-.375,cx+.70,cy+.375]);
    zone('dining','dining-entry','餐厅入门',[d[0]+.02,cy-.65,cx-.82,cy+.47]);
    zone('dining','dining-south-seat','南侧椅后空间',[cx-.70,d[1]+.03,cx+.70,cy-.91]);
    zone('dining','dining-north-seat','北侧椅后空间',[cx-.70,cy+.91,cx+.70,d[3]-.03]);
  }
  const living=room('north-living');
  if(living) {
    const [x,y,x1,y1]=living.bounds;
    add(living.id,'reading-set','reading-area',[x+.45,y+1.03,x+3.3,y1-.40]);
    add(living.id,'desk','reading-desk',[x1-1.9,y1-.62,x1-.15,y1-.035],{facing:'south'});
    zone(living.id,'living-entry','起居厅南侧通道',[x+.05,y+.05,x1-.05,y+.95]);
  }
  for(const r of rooms) {
    if(['north-small','east-small','west-passage','suite-passage','east-vestibule'].includes(r.id))continue;
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
    hall:[[x+1.01,y+.37,1.58],[x+3.91,y+2.71,1.05]],
    'master-bedroom':[[x+.40,y+.61,1.55],[x+1.86,y+2.96,1]],
    kitchen:[[x+.36,y+.42,1.6],[x1-.75,y1-.40,1.2]],
    dining:[[x+.25,y+.23,1.58],[(x+x1)/2,(y+y1)/2,.82]],
    'bathroom-lower':[[x1-.16,y+.87,1.55],[x+.72,y+.92,1.05]],
    'bathroom-upper':[[x1-.16,y+1.22,1.55],[x+.72,y+1.10,1.05]],
    'north-living':[[x+.40,y+.22,1.58],[x+2.6,y+2,1]],
  };
  const eastDoor=['bedroom-nw','bedroom-middle'].includes(id);
  const fallback=[[eastDoor?x1-.35:x+.35,y+.7,1.58],[(x+x1)/2,y1-1.2,.95]];
  const [eye,target]=presets[id]||fallback;
  const world=([a,b,h])=>[a,h+(plan.level-1)*p.floor_to_floor/1000,-b];
  return {eye:world(eye),target:world(target),label:s.label};
}
