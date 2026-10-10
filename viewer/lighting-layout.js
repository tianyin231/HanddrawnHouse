import {kitchenFrame} from './kitchen-layout.js';
export const LIGHTING_SCENES={
  day:{label:'白天 · 自然光',night:false,ceiling:0,local:0},
  daily:{label:'夜间 · 日常',night:true,ceiling:1,local:.65},
  rest:{label:'夜间 · 休息',night:true,ceiling:.18,local:.5},
  task:{label:'夜间 · 阅读 / 家务',night:true,ceiling:1,local:1}
};

// 敞口相连的厅、餐厅、厨房属于同一个观看照明区域；有门扇的卧室保持独立。
export function connectedLightingRooms(plans,roomKey) {
  if(!roomKey)return new Set();
  const [level,id]=roomKey.split(':'),plan=plans.find(p=>p.level===Number(level)),rooms=new Set([id]);
  let changed=true;
  while(changed){
    changed=false;
    for(const connection of plan.connections){
      const open=connection.kind==='open'||plan.openings.find(o=>o.id===connection.opening_id)?.door_leaf===false;
      if(!open||!connection.spaces.some(id=>rooms.has(id)))continue;
      for(const next of connection.spaces)if(!rooms.has(next)){rooms.add(next);changed=true;}
    }
  }
  return new Set([...rooms].map(id=>`${level}:${id}`));
}

// 灯具和观看光源共用位置；长条光源以中心点近似，非产品配光。
export function taskFixtures(layout) {
  const result=[];
  const strip=(item,key,name,bounds,bottom)=>result.push({id:`${item.id}/${key}`,source:item.id,space:item.space,name,type:'strip',bounds,bottom,height:.016});
  for(const item of layout.items) {
    const [x,y,x1,y1]=item.bounds;
    if(item.type==='kitchen') {
      const f=kitchenFrame(item),[a,q,a1,q1]=f.bounds,e=a1-item.depth,stove=a+(e-a)*.56;
      strip(item,'left-task','备餐台柜底灯',f.rect([a+.06,q1-.28,stove-.53,q1-.24]),1.510);
      strip(item,'right-task','转角台柜底灯',f.rect([stove+.53,q1-.28,e-.06,q1-.24]),1.510);
      strip(item,'sink-task','水槽上方工作灯',f.rect([a1-.43,q+.32,a1-.35,q+1.30]),layout.lights.find(l=>l.space===item.space).position[2]-.025);
    }
    if(item.type==='desk')result.push({id:`item/${item.id}/task`,source:item.id,space:item.space,name:'书桌灯',type:'desk',
      bounds:[x1-.50,y1-.34,x1-.16,y1-.18],bottom:1.19,height:.018,base:[x1-.19,y1-.26,.76]});
  }
  return result;
}

// previewIntensity 为渲染值，不是瓦数、流明或照度。
export function lightingLayout(layout) {
  const lights=layout.lights.map(lamp=>({id:`${layout.level}:${lamp.space}:ceiling`,space:lamp.space,group:'ceiling',
    name:'顶灯',position:[lamp.position[0],lamp.position[1],lamp.position[2]-.13],previewIntensity:lamp.space==='hall'?64:40,
    color:/bathroom|kitchen|north-living/.test(lamp.space)?'#fff2df':'#ffe7c7',source:'existing_ceiling_fixture'}));
  for(const item of layout.items) {
    const [x,y,x1,y1]=item.bounds,cx=(x+x1)/2,cy=(y+y1)/2;
    const fixture={
      nightstand:{name:'床头灯',position:[cx,cy,.785],previewIntensity:5},
      'floor-lamp':{name:'落地灯',position:[cx,cy,1.5],previewIntensity:12},
      vanity:{name:'镜前灯',position:[cx,y+.03,1.9525],previewIntensity:7}
    }[item.type];
    if(fixture)lights.push({id:`${layout.level}:${item.id}:local`,space:item.space,group:'local',...fixture,
      color:item.type==='vanity'?'#fff2df':'#ffe0b2',source:item.id});
  }
  for(const fixture of taskFixtures(layout)) {
    const [x,y,x1,y1]=fixture.bounds;
    lights.push({id:`${layout.level}:${fixture.id}`,space:fixture.space,group:'local',name:fixture.name,
      position:[(x+x1)/2,(y+y1)/2,fixture.bottom-.025],target:[(x+x1)/2,(y+y1)/2,fixture.type==='desk'?.78:.855],
      previewIntensity:fixture.type==='desk'?5:7,color:'#fff0da',source:fixture.source});
  }
  return lights.map(light=>({...light,level:layout.level,status:'preview_photometry_pending',control:light.group==='ceiling'?'房间顶灯分控':'局部灯独立控制'}));
}

export function lightingAdvice(room) {
  if(['kitchen','north-living'].includes(room))return ['顶灯与两段柜底灯、水槽上方工作灯分控；工作灯随沿墙橱柜布置。','灶台靠实墙，水槽沿外墙布置；最终防溅、散热、接线检修和照度随灯具及吊柜选型复核。'];
  if(room.startsWith('bathroom'))return ['顶灯与镜前灯分控；镜前灯用于洗漱区观看比较。','灯具安装区域、防潮等级、供电与检修方式待设备选型和专业复核。'];
  if(room==='hall')return ['顶灯与沙发旁落地灯分控，可比较日常、休息与阅读场景。','保留窗前通透和浅色顶墙作为改善方向；光照不足时补局部灯，不能由直射时长直接推断亮度。'];
  if(room.includes('bedroom'))return ['顶灯与床头灯分控，预留入口、床边操作顶灯的使用意图。','休息场景用于比较亮暗分区；床边开关位置和最终灯具照度尚待确认。'];
  return ['保留房间照明分控，开关位置与实际灯具规格待深化。'];
}
