// 仅表达设备旁的接驳候选位置；没有实测入口、污水出口和供电条件，不生成虚构主管。
import {showerDrain} from './wet-area-details.js';
import {kitchenFrame} from './kitchen-layout.js';
export function servicePoints(layout) {
  const points=[];
  const add=(item,name,position,kind,condition,options={})=>points.push({id:`${item.id}/${kind}`,space:item.space,name,position,kind,condition,status:'candidate_not_measured',...options});
  for(const item of layout.items) {
    const [x,y,x1,y1]=item.bounds,cx=(x+x1)/2;
    if(item.type==='kitchen') {
      const f=kitchenFrame(item),[a,q,a1,q1]=f.bounds;
      const upper=layout.level===2?'二层餐厨不在一层厨房正上方，立管和穿楼板位置待核。':'';
      add(item,'水槽冷热水',f.point([a1-.055,q+.78,.55]),'water','在水槽柜内核对阀门与检修空间；冷水入口、热水来源未定。'+upper);
      add(item,'水槽排水',f.point([a1-.28,q+.78,.28]),'waste','核对存水弯、墙排或地排及下游污水接点；未铺设主管。'+upper);
      add(item,'油烟机接口',f.point([a+(a1-item.depth-a)*.56,q1-.18,2.22]),'exhaust','罩体上方候选接驳处；灶台背后为室内隔墙，不能就近穿墙向卧室或厅堂排烟；室外终点及管路待核。');
    }
    if(item.type==='fridge')add(item,'冰箱电源',[x1+.04,y1-.04,.45],'power','预留可接近的位置，现场核对冰箱散热空间；回路、线径与保护配置未设计。');
    if(item.type==='vanity') {
      add(item,'洗手盆冷热水',[cx,y+.035,.55],'water','核对柜内检修与阀门位置，冷热水来源未定。');
      add(item,'洗手盆排水',[cx,y+.12,.28],'waste','待确定存水弯、墙排或地排及排污立管位置。');
    }
    if(item.type==='toilet')add(item,'坐便器排污候选点',[(x+x1-.1)/2,(y+y1)/2,.035],'waste','以最终产品坑距和排污方式为准；此点不是预埋定位。');
    if(item.type==='shower') {
      add(item,'淋浴冷热水',[x+.055,y1-.32,1.02],'water','混水器对应位置；防水节点、热水器位置及检修条件待定。');
      const drain=showerDrain(item,layout.floorTop),[a,q]=drain.center;
      add(item,'淋浴地漏',[a,q,drain.top],'waste','篦盖与饰面齐平，缝隙下仅为浅凹示意；降板、找坡、防水、存水弯及下游接管未确认。',{eye:[a+.40,q-.40,.75],markerScale:.12});
    }
  }
  return points;
}
