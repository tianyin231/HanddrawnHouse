import {ROOF_PROPOSAL} from './roof-concept.js';
import {siteLayout,annexRoofHeightAt,ANNEX_EDGE} from './site-layout.js';
import {interiorLayout} from './interior-layout.js';
import {wetAreaDetails} from './wet-area-details.js';
import {windowDetails} from './window-details.js';

export const BUILDING_SOURCES=[
  {id:'eaves',name:'Marley · 檐口衬层支承托盘',url:'https://www.marley.co.uk/accessories/felt-support-tray',scope:'参考衬层末端有支承、把水引入檐沟的关系；不是本项目的材料选定。'},
  {id:'tile',name:'Marley · Mendip 瓦产品参数',url:'https://www.marley.co.uk/roof-tiles/concrete-roof-tiles/mendip-double-pantile',scope:'示例说明最小坡度与瓦型、表面、搭接及坡长相关；不把海外产品参数套作本地验收值。'},
  {id:'edge',name:'Sika · 压顶下泛水节点 PDF',url:'https://usa.sika.com/dms/getdocument.get/3a04ed1d-a784-45cb-9530-fd186a7ea6ab/2-2-parapet-wall-with-metal-coping-cap.pdf',scope:'参考防水层沿墙上翻、压顶遮护收头的连续关系；不照搬其材料、固定间距和厚度。'},
  {id:'drain',name:'Sika · 压环落水口节点 PDF',url:'https://usa.sika.com/dms/getdocument.get/c57e8d36-8a65-458c-87b0-83c28841064c/6-1-clamping-ring-drain.pdf',scope:'参考防水层与落水斗的专用密封连接和可清理滤罩；具体体系与连接方法待选。'},
  {id:'wet',name:'Schluter · 淋浴防水与地漏连接',url:'https://www.schluter.com/schluter-us/en_US/article-tiled-shower-waterproofing',scope:'参考地面防水与墙地转角、专用地漏法兰的连续连接；不据此选定进口产品或施工尺寸。'},
  {id:'wet-entry',name:'Schluter · 无门槛淋浴的防水范围',url:'https://www.schluter.com/schluter-us/en_US/faq-how-far-should-waterproofing-extend-beyond-shower-threshold-curbless-shower',scope:'参考防水需要覆盖受水影响的范围，开放式淋浴的玻璃外也需考虑；实际体系、范围和标高待设计。'},
  {id:'window',name:'Andersen · 窗口连续排水关系',url:'https://www.andersenwindows.com/for-professionals/pro-views/window-install-water-control',scope:'该文针对带法兰窗与特定外墙体系，只参考窗下承接、顺水衔接和保留排水出口的关系；不照搬其封胶位置到本项目。'},
  {id:'joint',name:'Sika · 背衬棒与周边密封',url:'https://usa.sika.com/retail/en/products-catalog/sealants/accessories/sika-backer-rod.html',scope:'参考控制胶缝深度、避免三面粘结的关系；胶、背衬、基层相容性及尺寸待选。'}
];

export function buildingDetails(p,plan,plans=[plan]) {
  const q=ROOF_PROPOSAL,run=(p.house_depth+q.southEaveMm-160)/2000;
  const angle=Math.atan2(q.ridgeRiseMm/1000,run),slopeLength=Math.hypot(run,q.ridgeRiseMm/1000);
  const a=siteLayout(p,plan).annex,t=ANNEX_EDGE.width,[x,y,x1,y1]=a.bounds;
  const capBottom=a.roofBase+ANNEX_EDGE.baseAboveWall+ANNEX_EDGE.height;
  // 取女儿墙内侧四角和靠落水口的投影点，保留每个值，避免把最高处当作整圈可用高度。
  const positions=[[x+t,y+t],[x1-t,y+t],[x+t,y1-t],[x1-t,y1-t],[x1-t,a.outlet[1]],[a.outlet[0],y1-t]];
  const clearances=positions.map(([x,y])=>({position:[x,y],roof:annexRoofHeightAt(a,x,y),clearance:capBottom-annexRoofHeightAt(a,x,y)}));
  const windows=plans.flatMap(plan=>windowDetails(p,plan)),wetAreas=plans.flatMap(plan=>wetAreaDetails(interiorLayout(p,plan),plan));
  const metrics={windows,wetAreas,roof:{pitchDegrees:angle*180/Math.PI,pitchRatio:Math.tan(angle),slopeLengthM:slopeLength,
    projectedTileOverlapMm:q.tileLengthMm-q.tileGaugeMm,tileOverlapAlongSlopeMm:(q.tileLengthMm-q.tileGaugeMm)/Math.cos(angle),
    southEaveMm:q.southEaveMm,gutterFall:q.gutterFallPerM,product:null,compatibility:'not_verified'},
    annex:{clearances,capBottom,minimumClearanceMm:Math.min(...clearances.map(c=>c.clearance))*1000,
      maximumClearanceMm:Math.max(...clearances.map(c=>c.clearance))*1000,outlet:a.outlet,openingMm:a.openingRadius*2000,slope:a.roofSlope,
      membraneSystem:null,membraneThicknessMm:null,overflow:null,outfall:null}};
  return {status:'candidate_not_engineered',drawing:'schematic_not_to_scale',procurement_ready:false,metrics,sources:BUILDING_SOURCES,items:[
    {id:'eaves',name:'主屋檐口与瓦下排水',sources:['eaves','tile'],
      facts:[`当前模型坡度约 ${metrics.roof.pitchDegrees.toFixed(3)}°，单面斜长约 ${slopeLength.toFixed(2)} m；不按四舍五入后的坡度判定产品适配。`,
        `瓦片水平排布余量 ${metrics.roof.projectedTileOverlapMm} mm，换算沿坡约 ${Math.round(metrics.roof.tileOverlapAlongSlopeMm)} mm；这是模型搭接示意，未通过产品适配校核。`,
        `南向出檐 ${q.southEaveMm} mm；四周檐沟与两端落水管已有实体。`],
      proposal:['瓦下排水层在檐口获得连续支承，末端将水导入檐沟，避免停在封檐后。','瓦面排水和瓦下偶发渗水分别有出路；通风、保温及固定关系随屋面体系确定。'],
      pending:['当地可供应瓦型及最小坡度、搭接和坡长组合；当前外观不能证明瓦型适配。','屋面承重、保温/隔汽、瓦下防水与支承做法，檐口固定、风雪荷载。','檐沟容量、溢流、清理通道及地下雨水终点。']},
    {id:'annex-edge',name:'附属间压顶与防水上翻',sources:['edge'],
      facts:[`当前屋面找坡 ${(a.roofSlope*100).toFixed(1)}%，压顶下缘至屋面在抽取点约 ${Math.round(metrics.annex.minimumClearanceMm)}–${Math.round(metrics.annex.maximumClearanceMm)} mm。`,
        '这里计算的是模型几何余量，尚未扣入最终保护层，不等于可用防水上翻高度。','围边和压顶已有实体；防水层、收头压条和接缝密封尚未加入建筑实体。'],
      proposal:['候选防水层从屋面连续沿围边上翻，收头获得压顶遮护。','压顶接缝和固定单独深化；选择朝自家屋面排水的做法，边口设明确断水关系。'],
      pending:['所选体系要求的上翻、收头高度与保护层厚度，空间不足时再调整围边。','压顶材质、接缝变形、端部和转角做法及固定基层。']},
    {id:'annex-drain',name:'附属间落水口与检修',sources:['drain'],
      facts:[`现有东北角开孔为 ${Math.round(metrics.annex.openingMm)} mm 方形通孔，坡面汇向该处；孔尺寸不是雨水斗规格。`,
        '内落水管已有实体；成品雨水斗、过滤罩和防水连接尚未定型。'],
      proposal:['候选雨水斗设在汇水低处，防水层连续接到匹配的法兰或压环处。','预留可拆滤罩与清理空间；节点展开图将这些候选件单独标出。'],
      pending:['雨水斗与防水体系兼容性、连接固定方式及产品尺寸。','汇水量、暴雨排水能力、堵塞溢流与地下排出条件；不能只靠现有孔径判断够用。']},
    {id:'wet-floor',name:'卫浴地漏与墙地交界',sources:['wet'],
      facts:[`本报告包含 ${wetAreas.length} 处卫浴地漏，篦盖占位 120 × 120 mm，顶面与当前饰面齐平。`,'篦条间有真实缝隙，下方只表达浅凹；尚无真实地漏本体、存水弯或楼板穿孔。','现有卫浴地面为平面；墙砖高度是饰面方案，不代表防水高度。'],
      proposal:['选定防水体系后，地面、墙脚转角和管根形成连续防水，地漏采用匹配的连接部位。','找坡与地漏口标高共同确定；先核对安装空间，再决定降板或抬高做法。'],
      pending:['降板/楼板、找坡层、地砖与粘结层厚度；实际完成面和地漏高度。','地漏排水能力、防臭方式、清理方式、产品与防水相容性、排污去向。']},
    {id:'wet-entry',name:'卫浴门口与开放淋浴',sources:['wet-entry','wet'],
      facts:['当前卫浴、过门面与相邻房间均在模型基准上 24 mm，模型未表达门口挡水高差。',`固定玻璃南端按现有布置留约 ${wetAreas[0].glassOpeningMm} mm 分区入口；门洞和行走关系保持。`],
      proposal:['受水范围延伸到玻璃之外时，防水范围随之处理；门口与两侧墙脚衔接连贯。','比较可做坡差的平顺入口与挡水门槛两种方式，结合老人使用、排水和防水收头再定，不直接加一条凸起石材。'],
      pending:['实际卫浴与相邻房间/过道标高、结构可用空间、淋浴水流范围。','门槛/挡水方式、门套底部防潮、转角做法与防水完成后的检查安排。']},
    {id:'window-sill',name:'窗台找坡与滴水',sources:['window'],examples:[windows.find(v=>v.drip),windows.find(v=>!v.drip)],
      facts:[`${windows.length} 处外窗台沿同一剖面数据生成，其中 ${windows.filter(v=>v.drip).length} 处向自家南侧出挑 35 mm，保留外露滴水槽。`,
        '北、东、西侧窗台收在宅界内，已移除藏在墙内的滴水槽；这里只表达向外找坡。','窗台内外表面落差暂为 21 mm，是模型比例，不是已选窗台产品规格。'],
      proposal:['窗框底部与窗台、两端挡水和外墙防水衔接一起深化，保留实际窗系统的排水出口。','贴界窗采用能够在现有边界内组织排水的系统节点；外露南窗滴水槽也需核对饰面会不会将其覆盖。'],
      pending:['成品窗型材排水、安装进深、外墙/窗台饰面与端部挡水做法。','北、东、西侧边界与维护条件；未经确认不新增向邻地的出挑。']},
    {id:'window-joint',name:'窗框与外墙密封收口',sources:['joint','window'],
      facts:['已有窗扇、双层玻璃、型材示意和窗台；窗框与墙体之间尚未定义可施工胶缝。','密封胶、背衬、泛水材料与固定间距均未选定。'],
      proposal:['按真实窗框和基层设计周边接缝，用匹配背衬控制胶深，给接缝变形留出空间。','外侧挡雨、窗系统排水与内侧气密分别处理；固定与防水衔接按系统节点复核。'],
      pending:['接缝宽深、基层处理、材料相容性、耐候性能及窗框固定。','外墙保温/饰面体系、窗头与两侧泛水连续性，现场淋水检查条件。']}
  ]};
}
