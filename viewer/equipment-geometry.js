export function drawEquipment(equipment,g) {
  const {box:b}=g;
  for(const item of equipment.items) {
    g.context(item.space,'equipment');
    const [x,y,x1,y1]=item.bounds,h=item.bottom;
    b('white',x,y,x1,y1,h,item.height,true);
    if(item.type==='air-conditioner') {
      const vertical=['west','east'].includes(item.wall);
      const fx=item.wall==='west'?x1-.015:x-.004,fy=item.wall==='south'?y1-.015:y-.004;
      if(vertical) {
        b('metal',fx,y+.035,fx+.019,y1-.035,h+.024,.040);
        b('white',fx-.001,y+.04,fx+.021,y1-.04,h+.044,.01);
        b('screen',fx+.001,y1-.12,fx+.020,y1-.07,h+.18,.018);
      } else {
        b('metal',x+.035,fy,x1-.035,fy+.019,h+.024,.040);
        b('white',x+.04,fy-.001,x1-.04,fy+.021,h+.044,.01);
        b('screen',x1-.12,fy+.001,x1-.07,fy+.020,h+.18,.018);
      }
    } else {
      // 支吊关系为候选表达，固定方式和吊顶做法仍按最终产品复核。
      for(const a of [x+.035,x1-.035])for(const q of [y+.035,y1-.035])g.cylinder('metal',a,q,h+item.height,item.mountTop-h-item.height,.004);
      b('metal',x+.02,y+.02,x1-.02,y1-.02,h-.005,.006);
      for(let a=x+.026;a<x1-.026;a+=.027)b('white',a,y+.022,a+.016,y1-.022,h-.007,.005);
    }
  }
}
