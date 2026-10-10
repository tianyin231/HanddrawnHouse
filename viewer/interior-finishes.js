// 可见收口按方案厚度建模；基层、防水和固定方式没有施工确认。
export const FINISH_PROPOSAL={skirtingHeight:.08,skirtingDepth:.012,casingWidth:.045,casingDepth:.012,status:'proposal_not_measured'};

export function finishLayout(p,plan,layout) {
  const pieces=[],faces=[];
  for(const room of layout.rooms) {
    const [x,y,x1,y1]=room.bounds,wet=room.id.startsWith('bathroom'),kitchen=room.id==='kitchen'||room.use==='kitchen-dining';
    for(const wall of plan.walls) {
      const horizontal=wall.a[1]===wall.b[1],axis=(horizontal?wall.a[1]:wall.a[0])/1000,t=wall.thickness/2000;
      let surface,sign;
      if(horizontal&&Math.abs(axis+t-y)<.002){surface=y;sign=1;}
      else if(horizontal&&Math.abs(axis-t-y1)<.002){surface=y1;sign=-1;}
      else if(!horizontal&&Math.abs(axis+t-x)<.002){surface=x;sign=1;}
      else if(!horizontal&&Math.abs(axis-t-x1)<.002){surface=x1;sign=-1;}
      else continue;
      const origin=(horizontal?wall.a[0]:wall.a[1])/1000,end=(horizontal?wall.b[0]:wall.b[1])/1000;
      const a=Math.max(origin,horizontal?x:y),b=Math.min(end,horizontal?x1:y1);if(b<=a)continue;
      const holes=plan.openings.filter(o=>o.wall_id===wall.id).map(o=>({a:origin+o.offset/1000,b:origin+(o.offset+o.width)/1000,sill:(o.sill||0)/1000,head:o.head/1000,id:o.id,kind:o.kind}));
      faces.push({room:room.id,wall:wall.id,horizontal,surface,sign,a,b,holes,height:wall.height/1000});
      const add=(id,start,stop,z,height,depth,material)=>{
        if(stop<=start)return;
        const lo=Math.min(surface,surface+sign*depth),hi=Math.max(surface,surface+sign*depth);
        pieces.push({id:`${room.id}/${wall.id}/${id}`,room:room.id,wall:wall.id,bounds:horizontal?[start,lo,stop,hi]:[lo,start,hi,stop],z,height,material,length:stop-start});
      };
      if(!wet&&!kitchen) {
        let cursor=a;
        for(const hole of holes.filter(h=>h.kind==='door'&&h.b>a&&h.a<b).sort((a,b)=>a.a-b.a)) {
          add('skirting',cursor,Math.min(b,hole.a-FINISH_PROPOSAL.casingWidth),layout.floorTop,FINISH_PROPOSAL.skirtingHeight,FINISH_PROPOSAL.skirtingDepth,'white');
          cursor=Math.max(cursor,hole.b+FINISH_PROPOSAL.casingWidth);
        }
        add('skirting',cursor,b,layout.floorTop,FINISH_PROPOSAL.skirtingHeight,FINISH_PROPOSAL.skirtingDepth,'white');
      }
      for(const hole of holes.filter(h=>h.b>a&&h.a<b)) {
        const c=FINISH_PROPOSAL.casingWidth,depth=FINISH_PROPOSAL.casingDepth,material=hole.kind==='window'?'white':'wood';
        const base=hole.kind==='window'?hole.sill:layout.floorTop;
        add(`trim/${hole.id}/left`,Math.max(a,hole.a-c),Math.min(b,hole.a),base,hole.head-base,depth,material);
        add(`trim/${hole.id}/right`,Math.max(a,hole.b),Math.min(b,hole.b+c),base,hole.head-base,depth,material);
        add(`trim/${hole.id}/top`,Math.max(a,hole.a-c),Math.min(b,hole.b+c),hole.head,c,depth,material);
        if(hole.kind==='window')add(`trim/${hole.id}/sill`,Math.max(a,hole.a-c),Math.min(b,hole.b+c),hole.sill-.025,.025,.025,'stone');
      }
      // 卫浴东墙原来为了避门未铺面，现在只在门洞两侧补齐，绝不封门。
      if(wet&&!horizontal&&sign===-1) {
        let cursor=a;
        for(const hole of holes.filter(h=>h.kind==='door').sort((a,b)=>a.a-b.a)) {
          add('tile-east',cursor,Math.min(b,hole.a-FINISH_PROPOSAL.casingWidth),.025,2.015,.012,'tileWall');cursor=Math.max(cursor,hole.b+FINISH_PROPOSAL.casingWidth);
        }
        add('tile-east',cursor,b,.025,2.015,.012,'tileWall');
      }
    }
  }
  return {status:FINISH_PROPOSAL.status,dimensions:FINISH_PROPOSAL,pieces,faces};
}

export function drawFinishes(finishes,g) {
  for(const piece of finishes.pieces){g.context(piece.room,'finish');g.box(piece.material,...piece.bounds,piece.z,piece.height);}
}
