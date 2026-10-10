import {interiorLayout} from './interior-layout.js';
import {servicePoints} from './service-points.js';
import {lightingLayout} from './lighting-layout.js';

export const EQUIPMENT_SOURCES=[
  {name:'美的分体空调安装手册 · 安装空间、检修与冷凝水关系',url:'https://www.midea.com/content/dam/midea-aem/us/heating-and-cooling/installation-guide.pdf',
    scope:'参考安装关系；海外机型，不作本项目电气规格、采购型号或本地验收依据。'},
  {name:'松下换气扇资料 · 风管、机体与检修空间',url:'https://iaq.na.panasonic.com/ventilation/fans/whisperfit-dc',
    scope:'参考设备与风管关系；当前机体为通用占位，风量、静压及适用安装区域待选型。'}
];

// 仅确定房内候选占位。外机、排水终点和穿墙孔尚无依据，不生成伪装成已接通的管线。
export function equipmentLayout(p,plan,layout=interiorLayout(p,plan)) {
  const items=[],ceiling=p.wall_height/1000-.025;
  const ac=(room,wall,start,width=.85)=>{
    const [x,y,x1,y1]=room.bounds,depth=.22,bottom=ceiling-.575,height=.32;
    const bounds=wall==='west'?[x+.025,start,x+.025+depth,start+width]:wall==='east'?[x1-depth-.025,start,x1-.025,start+width]:
      wall==='north'?[start,y1-depth-.025,start+width,y1-.025]:[start,y+.025,start+width,y+depth+.025];
    const [a,q,a1,q1]=bounds,cx=(a+a1)/2,cy=(q+q1)/2;
    const vector={west:[1,0],east:[-1,0],north:[0,-1],south:[0,1]}[wall];
    const serviceBounds=wall==='west'?[a1+.50,q,a1+1.20,q1]:wall==='east'?[a-1.20,q,a-.50,q1]:
      wall==='north'?[a,q-1.20,a1,q-.50]:[a,q1+.50,a1,q1+1.20];
    const internal=['bedroom-nw','bedroom-east','hall'].includes(room.id);
    items.push({id:`${plan.level}:${room.id}:ac`,space:room.id,type:'air-conditioner',name:'壁挂空调候选',bounds,bottom,height,wall,
      serviceBounds,airflow:[[cx,cy],[cx+vector[0]*1.35,cy+vector[1]*1.35]],
      description:internal?'机位靠室内隔墙；冷媒管和冷凝水还需绕向室外，当前未连管。':'机位靠外墙实墙段；穿墙、外侧使用条件及室外终点待核。',
      checks:['先确认是否装机、采暖方式和房间负荷，再选机型；占位不代表匹数。',
        `当前机顶到模型顶面约 ${Math.round((ceiling-bottom-height)*1000)} mm；侧面、前方散热和检修按最终机型复核。`,
        '箭头仅表示拟送风方向，不是气流模拟；导风角度和坐卧舒适性另核。',
        '外机承托、噪声、检修通道和冷凝水连续下坡终点未确定，不向邻地或通道直接排水。']});
  };
  for(const room of layout.rooms) {
    const [x,y,x1,y1]=room.bounds;
    if(room.id==='master-bedroom')ac(room,'west',y+.36);
    if(room.id==='bedroom-nw')ac(room,'east',y+.75);
    if(room.id==='bedroom-ne')ac(room,'north',x+.25);
    if(room.id==='bedroom-middle')ac(room,'north',x+2.11);
    if(room.id==='bedroom-east')ac(room,'west',y+.76);
    if(room.id==='hall')ac(room,'west',y+1,1.05);
    if(room.id.startsWith('bathroom')) {
      const cx=x+1.88,cy=y+.86,h=ceiling-.22;
      items.push({id:`${plan.level}:${room.id}:fan`,space:room.id,type:'extract-fan',name:'卫浴排风候选',
        bounds:[cx-.15,cy-.15,cx+.15,cy+.15],bottom:h,height:.16,mountTop:ceiling,
        serviceBounds:[cx-.32,cy-.30,cx+.32,cy+.30],
        // 虚线只表达室内拟走向，终止于内墙面；不切墙、不预设风管直径。
        route:[[cx,cy,h+.08],[x+.36,cy,h+.08],[x+.36,y+.25,h+.08],[x+.025,y+.25,h+.08]],
        description:'排风机位于洗漱侧上方；拟在卫浴内向西走管，绕开西侧高窗，终止于待核穿墙位置。',
        checks:['机体暂按 300 × 300 × 160 mm 占位，需局部吊顶或明装罩；现有顶面不代表吊顶已定。',
          '每间独立排风，厨房油烟另走；室外出口与防倒灌、风阻、冷凝和补风条件待核。',
          '候选机位避开淋浴上方，但防水等级、供电保护、拆洗及穿墙结构仍需按机型复核。']});
    }
  }
  return {level:plan.level,status:'candidate_not_selected',outdoor_units:[],penetrations:[],items:items.map(item=>({...item,
    status:'candidate_not_selected',capacity:null,product:null,connections_status:'unconnected'}))};
}

export function equipmentPoints(equipment) {
  return equipment.items.map(item=>({id:item.id,space:item.space,name:item.name,
    position:[(item.bounds[0]+item.bounds[2])/2,(item.bounds[1]+item.bounds[3])/2,item.bottom+item.height/2],
    eye:[(item.serviceBounds[0]+item.serviceBounds[2])/2+(item.type==='extract-fan'?.20:0),
      (item.serviceBounds[1]+item.serviceBounds[3])/2+(item.type==='extract-fan'?.25:0),1.65],
    kind:'equipment',status:item.status,condition:item.description+' '+item.checks[0]}));
}

// 连接关系清单与具体走线分开；null 明确表示没有现场定位，不给出虚构管径或回路容量。
export function serviceSystems(layout,equipment) {
  const points=servicePoints(layout),lights=lightingLayout(layout);
  return [
    {id:'cold-water',name:'给水',terminalIds:points.filter(v=>v.kind==='water').map(v=>v.id),source:null,
      intention:'入户水源 → 可检修的分配与阀门 → 厨卫用水点',missing:'入户位置、水压、供水方式；管径与阀门位置'},
    {id:'hot-water',name:'热水',terminalIds:points.filter(v=>v.kind==='water').map(v=>v.id),source:null,
      intention:'待定热源 → 厨卫热水点',missing:'热水器类型、位置、使用人数、能源和冬季运行方式'},
    {id:'waste',name:'生活排水',terminalIds:points.filter(v=>v.kind==='waste').map(v=>v.id),outlet:null,
      intention:'各器具排水 → 待定支管/立管 → 待定污水出口；雨水另核',missing:'出口及标高、通气、存水弯、楼板与防水；不由俯视图推定管坡'},
    {id:'lighting',name:'照明供电',terminalIds:lights.map(v=>v.id),source:null,
      intention:'配电位置待定 → 楼层照明分组 → 房间顶灯与局部灯分控',missing:'灯具功率/配光、开关位置、导线及保护配置；观看分组不等于实际回路'},
    {id:'appliances',name:'厨房及设备供电',terminalIds:[...points.filter(v=>v.kind==='power').map(v=>v.id),...equipment.items.map(v=>v.id)],source:null,
      intention:'先汇总冰箱、烟机、空调、排风等负荷，再由电气方案确定回路',missing:'进线容量、配电箱、灶具能源、设备铭牌及接地；未指定线径或开关容量'},
    {id:'ventilation',name:'排烟与排风',terminalIds:[...points.filter(v=>v.kind==='exhaust').map(v=>v.id),...equipment.items.filter(v=>v.type==='extract-fan').map(v=>v.id)],outlet:null,
      intention:'厨房烟机与各卫浴分开排出；虚线仅示卫浴室内拟走向',missing:'室外出口、风管、止回与补风、噪声和穿墙条件'},
    {id:'cooling',name:'空调与冷凝水',terminalIds:equipment.items.filter(v=>v.type==='air-conditioner').map(v=>v.id),outlet:null,
      intention:'候选内机 ↔ 待定外机；冷凝水另找连续下坡的可接收终点',missing:'是否安装、负荷与机型、外机平台/固定、冷媒长度高差、冷凝水去向'}
  ].map(system=>({...system,level:layout.level,status:'interfaces_pending',routes:[],sizing:null}));
}
