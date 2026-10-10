// 沿用北/东两段 L 形柜的局部坐标，再映射到实际靠墙方向。
// 家具、灯具、接点、平面与行走碰撞共用同一变换。
export function kitchenFrame(item) {
  const [x,y,x1,y1]=item.bounds,turned=['southwest','northwest'].includes(item.corner);
  const bounds=turned?[0,0,y1-y,x1-x]:item.bounds;
  const point=([a,q,h=0])=>!turned?[a,q,h]:[x1-q,item.corner==='southwest'?y1-a:y+a,h];
  const rect=([a,q,a1,q1])=>{
    const p=point([a,q]),r=point([a1,q1]);
    return [Math.min(p[0],r[0]),Math.min(p[1],r[1]),Math.max(p[0],r[0]),Math.max(p[1],r[1])];
  };
  return {bounds,point,rect,reflected:item.corner==='southwest'};
}

export function kitchenFootprint(item) {
  const f=kitchenFrame(item),[x,y,x1,y1]=f.bounds;
  return [[x,y1-item.depth,x1-item.depth,y1],[x1-item.depth,y,x1,y1]].map(f.rect);
}
