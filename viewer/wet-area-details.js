// 仅细化现有地漏的可见篦盖；不切结构楼板，也不假定存水弯或排水支管。
export const SHOWER_OPENING_M=.87;
export function showerDrain(item,floorTop) {
  const [x,,,y1]=item.bounds,cx=x+.24,cy=y1-.24;
  return {id:item.id+'/waste',space:item.space,center:[cx,cy],bounds:[cx-.06,cy-.06,cx+.06,cy+.06],
    top:floorTop,bottom:.010,frameWidth:.01,barWidth:.006,barCount:6,
    status:'candidate_not_selected',body:null,trap:null,connection:null,
    checks:['120 mm 方形篦盖为现有方案占位；真实地漏厚度、存水弯和接管方式待选。','当前仅在饰面厚度内表达浅凹槽，不能据此判断地漏安装空间够用。']};
}

export function wetAreaDetails(layout,plan) {
  return layout.rooms.filter(r=>r.id.startsWith('bathroom')).map(room=>{
    const shower=layout.items.find(i=>i.space===room.id&&i.type==='shower');
    const connection=plan.connections.find(c=>c.spaces.includes(room.id)&&c.opening_id);
    const door=plan.openings.find(o=>o.id===connection.opening_id);
    return {level:layout.level,space:room.id,label:room.label,drain:showerDrain(shower,layout.floorTop),
      finishedFloor:layout.floorTop,adjacentFloor:layout.floorTop,door:door.id,doorWidthMm:door.width,
      showerBounds:shower.bounds,glassOpeningMm:SHOWER_OPENING_M*1000,
      fall:null,recess:null,threshold:null,membrane:null,membraneThicknessMm:null,
      status:'waterproofing_and_levels_pending'};
  });
}

// 从一块饰面砖中让出篦盖占位，保留周边实体，结构楼板保持原样。
export function subtractFloorOpening(bounds,cut) {
  const [x,y,x1,y1]=bounds,a=Math.max(x,cut[0]),b=Math.max(y,cut[1]),c=Math.min(x1,cut[2]),d=Math.min(y1,cut[3]);
  if(a>=c||b>=d)return [bounds];
  return [[x,y,a,y1],[c,y,x1,y1],[a,y,c,b],[a,d,c,y1]].filter(([a,b,c,d])=>c-a>1e-6&&d-b>1e-6);
}

export function drawWetDrains(drains,g) {
  for(const drain of drains) {
    const [x,y,x1,y1]=drain.bounds,t=drain.frameWidth,h=drain.top,z=drain.bottom;
    g.context(drain.space,'wet-drain');
    g.box('screen',x+t,y+t,x1-t,y1-t,z,.001);
    for(const b of [[x,y,x+t,y1],[x1-t,y,x1,y1],[x+t,y,x1-t,y+t],[x+t,y1-t,x1-t,y1]])g.box('steel',...b,z,h-z);
    const gap=(x1-x-2*t-drain.barCount*drain.barWidth)/(drain.barCount+1);
    for(let i=0;i<drain.barCount;i++) {
      const a=x+t+gap+i*(gap+drain.barWidth);
      g.box('steel',a,y+t,a+drain.barWidth,y1-t,h-.003,.003);
    }
  }
}
