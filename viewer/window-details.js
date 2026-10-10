// 外窗台剖面共用于 Blender 和复核页；北、东、西侧不增加宅界外出挑。
export function windowDetails(p,plan) {
  return plan.openings.filter(o=>o.kind==='window').map(o=>{
    const w=plan.walls.find(w=>w.id===o.wall_id),dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],length=Math.hypot(dx,dy),along=[dx/length,dy/length];
    const sign=['east-house','south-master','hall-front','stair-north'].includes(w.id)?-1:1;
    const outward=[-along[1]*sign,along[0]*sign],projection=outward[1]<-.5?.035:0;
    const outside=w.thickness/2000+projection,inside=-.075,bottom=o.sill/1000;
    const section=[[inside,bottom+.006],[outside,bottom-.015],[outside,bottom-.060]];
    if(projection>0)section.push([outside-.014,bottom-.060],[outside-.014,bottom-.050],[outside-.021,bottom-.050],[outside-.021,bottom-.060]);
    section.push([inside,bottom-.045]);
    return {id:o.id,level:plan.level,wall:w.id,along,outward,origin:[(w.a[0]+along[0]*o.offset)/1000,(w.a[1]+along[1]*o.offset)/1000],width:o.width/1000,
      section,projectionMm:projection*1000,sillDepthMm:(outside-inside)*1000,surfaceFallMm:21,
      drip:projection>0?{widthMm:7,depthMm:10,exposed:true}:null,
      status:'proposal_not_engineered',perimeterJoint:null,flashing:null,frameDrainage:null};
  });
}
