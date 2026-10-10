import {interiorLayout} from './interior-layout.js';
import {servicePoints} from './service-points.js';
import {finishLayout} from './interior-finishes.js';

export const ITEM_NAMES={sofa:'沙发','coffee-table':'茶几','tv-cabinet':'电视柜','floor-lamp':'落地灯',bed:'床',nightstand:'床头柜',wardrobe:'衣柜',fridge:'冰箱',kitchen:'L 形橱柜','dining-set':'四人餐桌',vanity:'浴室柜',toilet:'坐便器',shower:'淋浴区','reading-set':'阅读座椅',desk:'书桌'};
export const PENDING_ITEMS=[
  {id:'site',scope:'现场待核',title:'边界、墙厚与完成面尺寸',model:'两层平面、扣墙尺寸与三维几何共用数据；可导出尺寸图。',required:'场地两端宽度与对角线、墙厚、门窗逐樘定位、地面高差、饰面厚度。',affects:'所有房间、门窗与柜体下单',rooms:[]},
  {id:'structure',scope:'专业复核',title:'结构、屋面、梁柱与栏杆固定',model:'实体屋顶、出檐、梁柱、楼梯和护栏已有方案形体。',required:'地基、承重体系、跨度、荷载、配筋、连接与固定方案；楼梯梁下净空。',affects:'结构与施工节点',rooms:[]},
  {id:'water',scope:'现场待核',title:'给水与热水来源',model:'水槽、洗手盆和淋浴旁已设候选接点。',required:'入户位置、水压、供水方式、热水设备位置与供电条件；阀门检修位置。',affects:'主管路由与设备选型',rooms:['kitchen','bathroom-lower','bathroom-upper']},
  {id:'drain',scope:'现场待核',title:'污水、雨水与防水节点',model:'设备排水候选点、屋面落水与院内排水沟已表达。',required:'污水出口位置和标高、接入条件、雨污去向、立管/通气位置、楼板降板与防水基层。',affects:'管坡、穿板、地漏及防水节点',rooms:['kitchen','bathroom-lower','bathroom-upper','courtyard']},
  {id:'power',scope:'现场待核',title:'配电、开关插座与照明',model:'已有示意灯具和冰箱电源候选位置；室内灯为观看照明。',required:'进线与配电箱位置、可用容量、接地条件、电器功率、回路及保护配置；灯具配光资料。',affects:'电气设计与照度校核',rooms:[]},
  {id:'air',scope:'现场及选型待定',title:'排烟、卫浴排风与空调',model:'厨房罩体、油烟机候选接点已有；设备检修条件已列出。',required:'灶具能源、排烟/排风出口、外机可放位置、冷凝水去向、采暖制冷需求及机型。',affects:'孔洞、设备安装、噪声与检修通道',rooms:[]},
  {id:'sun',scope:'现场待核',title:'北向、邻房与真实光照',model:'支持太阳方向、四窗样点遮挡与邻房假设调整。',required:'准确坐标与北向、邻房檐口屋脊轮廓及同基准标高；如需时长/照度结论，补相应计算条件。',affects:'日照时长、室内照度结论',rooms:[]},
  {id:'product',scope:'选型待定',title:'门窗五金、家具与材料样板',model:'门柜及家电占位、开合、饰面收口与候选材料已建立。',required:'成品尺寸、门扇最大开角、散热/安装说明、封边与板材资料；A/B 配色、砖面与地板实物样板。',affects:'最终色板、采购及五金细部',rooms:[]},
  {id:'uses',scope:'用途待定',title:'烧香间与小间的设备需求',model:'维持现有房间用途和空置范围。',required:'二层右侧小间、附属间具体用途；烧香间实际使用方式和设备需求。',affects:'这些空间的专用家具、通风和设备',rooms:['north-small','east-small','annex-north','annex-south']},
  {id:'device',scope:'实机待测',title:'手机和平板性能',model:'可切换画质，支持触屏方向键、拖动与响应式视口。',required:'在实际设备上检查帧率、发热、内存和触控；模拟视口不能代表真实设备性能。',affects:'最终移动端验收',rooms:[]}
];
export const MATERIAL_CANDIDATES=[
  {id:'tile800',name:'一层干区 · 800 × 800 瓷砖候选',model:'当前模型按 800 mm 模数排布，浅暖灰为 A 配色。',options:'先比较同规格素色/细纹样板；另可比较 600 mm 模数，但需重新排版，不直接按本模型采购。',check:'核对实际尺寸、厚度、表面光泽、湿态防滑资料、色号与当地供货。表面“哑光”不等于已证实防滑。',source:'东鹏官网 · 800 × 800 产品规格示例',url:'https://www.dongpeng.net/product/info_11_itemid_16836_lcid_97.html'},
  {id:'timber',name:'二层干区 · 木地板候选',model:'模型用 180 × 1200 的板条表达纹理节奏，未锁定产品尺寸。',options:'强化地板与多层实木分别询同面积完整辅料方案；保留浅木色和浅灰色样板比较。',check:'核对真实板幅、基层含水条件、铺设方法、伸缩缝、采暖适配和排放检测资料。',source:'大自然官网 · 地板产品分类',url:'https://www.nature-cn.cn/product/268001003.html?page=2&sid=004000&top=0'},
  {id:'paint',name:'干区墙顶 · 可擦洗内墙面漆候选',model:'浅色平涂为当前方案；不增加复杂背景墙和大面积装饰线。',options:'比较基础面漆与可擦洗产品的小样、底漆/腻子配套和修补色差；选择简单可维护的做法。',check:'按最终技术资料核对基层、底涂与施工条件；“净味”不代表无需通风或排放验收。',source:'立邦官网 · 易擦洗内墙漆资料示例',url:'https://www.nipponpaint.com.cn/product/2035'},
  {id:'wet',name:'厨卫地墙与收口',model:'地面 600 mm 模数；卫浴墙面模型厚 12 mm、高 2.04 m，门洞已让开。',options:'优先比较易清洁的简单表面与配套收口；防水层、粘结层和找坡单独设计。',check:'墙砖高度、地砖防滑、地漏切割排版、基层与防水体系待确认；模型墙面高度不是防水上翻要求。'},
  {id:'cabinet',name:'柜体、台面与五金',model:'衣柜约 600 mm 深，厨房地柜约 600 mm 深；转角设 60 mm 收口，活动构件可检查。',options:'柜门用统一模块、可更换把手；台面保持简单边型，先比较封边、板件与五金实物。',check:'板材/封边/五金检测、台面厚度、设备开孔及成品公差均按最终产品复核。'}
];
export function maintenanceNotes(item) {
  return ({fridge:['前方留出开门与抽屉使用位置；当前已表达 90° 开门。','左右、背后及顶部散热距离按最终说明书确认；现有缝隙不作合格判断。'],kitchen:['水槽柜保持可开门检修，阀门和存水弯不得被固定隔板封死。','灶具、烟机的净距、供能方式、排烟孔和维修拆卸路线按最终机型核对。'],vanity:['盆下接头可从柜门接近，镜灯接线和固定另核。'],toilet:['坑距、排污方式、侧面检修及上方水箱盖取下空间按成品确认。'],shower:['固定玻璃南侧保留开口；地漏、混水器与防水衔接现场复核。'],wardrobe:['门扇逐个开合已检查；顶柜、挂衣和内部隔板仍可按使用习惯调整。'],'tv-cabinet':['抽屉开启后保持前方通道；电视固定和电源走线待选型。']})[item.type]||['当前为可调整的家具占位；搬入路线、成品规格与现场净距待核。'];
}
export function designReview(p,plans) {
  const floors=plans.map(plan=>{
    const layout=interiorLayout(p,plan),finishes=finishLayout(p,plan,layout);
    const rooms=layout.rooms.map(room=>{
      const [x,y,x1,y1]=room.bounds,area=(x1-x)*(y1-y),wet=/bathroom|kitchen/.test(room.id);
      const skirting=finishes.pieces.filter(v=>v.room===room.id&&v.id.endsWith('/skirting')).reduce((s,v)=>s+v.length,0);
      return {...room,area,skirting,material:wet?'厨卫地砖':plan.level===2?'木地板候选':'干区地砖',items:layout.items.filter(v=>v.space===room.id),zones:layout.zones.filter(v=>v.space===room.id),services:servicePoints(layout).filter(v=>v.space===room.id)};
    });
    return {level:plan.level,rooms,quantities:{floorArea:rooms.reduce((s,r)=>s+r.area,0),skirting:rooms.reduce((s,r)=>s+r.skirting,0)},finishes};
  });
  return {schema_version:1,status:'proposal_not_surveyed',engineering_acceptance:'not_assessed',procurement_ready:false,
    quantities_basis:'房间扣墙矩形面积与已建模踢脚线净长；不含门洞过门面、门廊、楼梯、院子、附属间、损耗或采购量',floors,pending:PENDING_ITEMS,materials:MATERIAL_CANDIDATES};
}
