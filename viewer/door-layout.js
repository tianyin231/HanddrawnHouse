// 门扇开启方向为布置方案；门洞仍由原平面控制，不增删通行关系。
export function doorLayout(p,plan) {
  const result=[];
  for(const o of plan.openings.filter(o=>o.kind==='door'&&o.door_leaf!==false)) {
    const wall=plan.walls.find(w=>w.id===o.wall_id),horizontal=wall.a[1]===wall.b[1];
    const x=(wall.a[0]+(horizontal?o.offset:0))/1000,y=(wall.a[1]+(horizontal?0:o.offset))/1000;
    const width=o.width/1000-.116,height=o.head/1000-.065;
    const room=plan.connections.find(c=>c.opening_id===o.id)?.spaces.at(-1)||o.id;
    const z=o.id.startsWith('annex-')?-p.entrance_proposal.yard_drop_mm/1000:0;
    const count=o.id==='main-hall-door'?2:1;
    for(let i=0;i<count;i++) {
      // 南墙房门开进房间；卫浴采用北侧铰链，避开南侧洗手盆。
      const reverse=(!horizontal&&o.id.startsWith('bathroom'))||o.id==='master-suite-entry-door'||o.id==='east-bedroom-door'||i===1;
      const length=width/count-.003;
      const start=(horizontal?x:y)+.058+i*width/count;
      const end=start+length,pivot=horizontal?[reverse?end:start,y,z]:[x,reverse?end:start,z];
      let amount=reverse?-Math.PI/2:Math.PI/2;
      if(o.id==='master-suite-entry-door'||o.id==='east-bedroom-door')amount=Math.PI/2;
      if(!horizontal&&!o.id.startsWith('bathroom'))amount=-Math.PI/2;
      result.push({id:`door/${plan.level}/${o.id}/${i}`,owner:o.id,opening:o.id,room,
        label:`${plan.spaces.find(s=>s.id===room)?.label||'入户'}门${count>1?i+1:''}`,
        pivot,amount,bounds:horizontal?[start,y-.021,end,y+.021]:[x-.021,start,x+.021,end],height,z});
    }
  }
  return result;
}
