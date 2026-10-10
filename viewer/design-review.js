import {blueprintSVG,escapeXML as e} from './blueprint.js';
import {designReview,ITEM_NAMES,maintenanceNotes} from './design-review-data.js';
import {auditDimensions} from './dimension-audit.js';
import {buildingDetailSVG} from './building-detail-svg.js';

const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
let parameters,plans,report,floor=query.get('floor')==='2'?2:1,selected=query.get('room')||'hall',zoom=false,activePanel='room',detailId='eaves';
const mm=value=>Math.round(value*1000).toLocaleString('zh-CN');
const roomsNow=()=>plans.find(p=>p.level===floor).spaces.filter(s=>s.id!=='courtyard');
const roomNow=()=>report.floors.find(f=>f.level===floor).rooms.find(r=>r.id===selected)||(()=>{
  const space=roomsNow().find(r=>r.id===selected),bounds=space.clear_bounds_mm.map(v=>v/1000);
  const publicLighting=report.floors.find(f=>f.level===floor).circulation;
  return {...space,bounds,area:(bounds[2]-bounds[0])*(bounds[3]-bounds[1]),material:'未计入装修用量',skirting:0,items:[],zones:[],services:[],
    lighting:[...publicLighting.items,...publicLighting.existing].filter(l=>l.space===selected),lightingAdvice:publicLighting.checks};
})();
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function equipmentCard(item) {
  const [x,y,x1,y1]=item.bounds;
  return `<article class="review-item"><strong>${e(item.name)}</strong><p class="status">候选占位 · 未选型 · 未接通</p><p class="model-value">平面 ${mm(x1-x)} × ${mm(y1-y)} mm · 机底距本层模型地面 ${mm(item.bottom)} mm</p><p>${e(item.description)}</p><details><summary>安装与检修待核</summary>${item.checks.map(v=>`<p>${e(v)}</p>`).join('')}</details></article>`;
}
function drawing(){
  if(activePanel==='building'){$('drawing').innerHTML=buildingDetailSVG(report.building_details.items.find(item=>item.id===detailId),$('building-candidate').checked);return;}
  const options={furnished:$('plan-mode').value==='furnished',dimensions:$('plan-dimensions').checked,zones:$('plan-zones').checked,services:$('plan-services').checked,equipment:$('plan-equipment').checked,selected,zoom};
  $('drawing').innerHTML=blueprintSVG(parameters,plans.find(p=>p.level===floor),options);
  $('plan-overview').setAttribute('aria-pressed',String(!zoom));$('plan-zoom').setAttribute('aria-pressed',String(zoom));
}
function showRoom(){
  const room=roomNow(),[x,y,x1,y1]=room.bounds;
  $('review-room').value=selected;$('review-room-name').textContent=room.label;
  $('review-room-size').textContent=`扣墙模型净界 ${mm(x1-x)} × ${mm(y1-y)} mm · ${room.area.toFixed(2)} ㎡`;
  const size=item=>`${mm(item.bounds[2]-item.bounds[0])} × ${mm(item.bounds[3]-item.bounds[1])} mm`;
  const itemSize=item=>item.type==='wall-art'?`两幅组合 · 墙面宽 ${mm(item.bounds[3]-item.bounds[1])} × 高 ${mm(item.height)} mm · 画底高 ${mm(item.bottom)} mm`:
    `平面占位 ${size(item)}${item.height?` · 高 ${mm(item.height)} mm`:''}`;
  $('review-room-details').innerHTML=`<dl><dt>地面方案</dt><dd>${e(room.material)}</dd><dt>地面矩形净面积</dt><dd>${room.area.toFixed(2)} ㎡</dd><dt>已建模踢脚线净长</dt><dd>${room.skirting.toFixed(2)} m</dd></dl><p class="note">面积未减饰面厚度和柱等突出，踢脚线已扣门洞及门套让位；均不是下单数量。</p>
    <h2>家具与检修</h2>${room.items.length?room.items.map(item=>`<article class="review-item"><strong>${e(ITEM_NAMES[item.type])}</strong><p class="model-value">${itemSize(item)}</p>${maintenanceNotes(item).map(v=>`<p>${e(v)}</p>`).join('')}</article>`).join(''):'<p class="note">保留现有用途，未布置专用家具。</p>'}
    <h2>灯具与控制意图</h2>${room.lighting?.map(l=>`<article class="review-item"><strong>${e(l.name)}</strong><p>${e(l.control)} · 观看光源高约 ${mm(l.position[2])} mm</p></article>`).join('')||'<p class="note">尚未布置专用灯具。</p>'}${room.lightingAdvice?.map(v=>`<p class="note">${e(v)}</p>`).join('')||''}<p class="note">三维页支持自然光、夜间日常、休息与阅读/家务场景。光源高度来自当前灯具模型，配光、真实照度、调光兼容性与电路均待确认。</p>
    <h2>设备候选</h2>${room.equipment?.map(equipmentCard).join('')||'<p class="note">未设置专用空调或排风机位。</p>'}
    <h2>使用范围</h2>${room.zones.map(z=>`<p class="model-value">${e(z.label)} · ${size(z)}</p>`).join('')||'<p class="note">此房间尚无单独使用区标记。</p>'}${room.equipment?.length?'<p class="note">勾选“灯具与设备”和“使用范围”可查看本房间设备检修候选区。</p>':''}
    <h2>候选接点</h2>${room.services.map((s,i)=>`<article class="review-item"><strong>${i+1}. ${e(s.name)}</strong><p class="status">候选位置 · 未测量</p><p>相对本层模型地面高 ${mm(s.position[2])} mm</p><p>${e(s.condition)}</p></article>`).join('')||'<p class="note">未布置专用设备接点。电气、排风和空调条件见待确认清单。</p>'}
    ${room.wetDetails?'<h2>卫浴标高与防水</h2><p class="note">当前地漏篦盖与饰面齐平，地面和门口仍等高。模型没有确认降板、找坡、挡水或防水体系。</p><p><button data-room-detail="wet-floor">查看地漏与墙地节点</button></p><p><button data-room-detail="wet-entry">查看卫浴门口节点</button></p>':''}
    <h2>与本房间相关的待确认项</h2><ul class="small-list">${report.pending.filter(v=>!v.rooms.length||v.rooms.includes(selected)).map(v=>`<li>${e(v.title)} · ${e(v.scope)}</li>`).join('')}</ul>`;
  const url=new URL(location);url.searchParams.set('floor',floor);url.searchParams.set('room',selected);history.replaceState(null,'',url);
  drawing();
}
function showFloor(){
  const rooms=roomsNow();
  if(!rooms.some(r=>r.id===selected))selected='hall';
  $('plan-floor').value=floor;$('review-room').innerHTML=rooms.map(r=>`<option value="${e(r.id)}">${e(r.label)}</option>`).join('');showRoom();showEquipment();
}
function showEquipment() {
  const data=report.floors.find(f=>f.level===floor),items=data.equipment.items;
  $('review-equipment').innerHTML=`<h2>${floor} 层 · ${items.filter(v=>v.type==='air-conditioner').length} 处空调候选 / 2 处排风候选</h2><p class="note">空调位置用于先检查能否放下，不代表已决定每间装机。采暖、热水和设备数量待使用需求确认。</p>`+
    data.rooms.filter(r=>r.equipment.length).map(r=>`<h2><button data-equipment-room="${e(r.id)}">看${e(r.label)}位置</button></h2>${r.equipment.map(equipmentCard).join('')}`).join('')+
    `<h2>公共通行照明</h2><p class="note">${floor} 层记录新增 ${data.circulation.items.length} 处、原有 ${data.circulation.existing.length} 处灯具。两跑楼梯随一层实体记录，不能将其高度理解为一层顶灯。</p>`+
    data.circulation.items.map(l=>`<article class="review-item"><strong>${e(l.name)}</strong><p>光源相对本层基准 ${mm(l.position[2])} mm · ${e(l.control)}</p></article>`).join('')+
    data.circulation.checks.map(v=>`<p class="note">${e(v)}</p>`).join('')+
    '<h2>连接关系与缺少的接口</h2>'+data.systems.map(s=>`<article class="review-item"><strong>${e(s.name)}</strong><p>${e(s.intention)}</p><p class="note">待补：${e(s.missing)}</p></article>`).join('')+
    '<h2>安装关系参考</h2>'+report.equipment_sources.map(s=>`<p><a class="action-link" href="${e(s.url)}" target="_blank" rel="noreferrer">${e(s.name)} ↗</a></p><p class="note">${e(s.scope)}</p>`).join('');
}
function activatePanel(panel) {
  activePanel=panel;
  document.querySelectorAll('[data-panel]').forEach(b=>{const active=b.dataset.panel===panel;b.setAttribute('aria-pressed',String(active));$(`panel-${b.dataset.panel}`).hidden=!active;});
  const url=new URL(location);url.searchParams.set('panel',panel);history.replaceState(null,'',url);
  if(panel==='equipment')$('plan-equipment').checked=true;
  document.querySelector('.drawing-tools').hidden=panel==='building';
  $('building-drawing-hint').hidden=panel!=='building';
  $('plan-overview').hidden=panel==='building';$('plan-zoom').hidden=panel==='building';
  document.querySelector('.drawing-pane').setAttribute('aria-label',panel==='building'?'建筑节点关系图':'装修平面图');
  drawing();
}
function showBuilding(){
  const data=report.building_details,item=data.items.find(item=>item.id===detailId);
  $('review-building').innerHTML=`<h1>${e(item.name)}</h1><p class="status">候选关系 · 未工程复核</p><h2>模型中已有</h2>`+
    item.facts.map(v=>`<p class="model-value">${e(v)}</p>`).join('')+'<h2>本轮候选做法</h2>'+item.proposal.map(v=>`<p>${e(v)}</p>`).join('')+
    '<h2>定稿还需</h2>'+item.pending.map(v=>`<p class="note">${e(v)}</p>`).join('')+
    '<h2>厂家资料与适用范围</h2>'+data.sources.filter(s=>item.sources.includes(s.id)).map(s=>`<p><a class="action-link" href="${e(s.url)}" target="_blank" rel="noreferrer">${e(s.name)} ↗</a></p><p class="note">${e(s.scope)}</p>`).join('');
  if(activePanel==='building')drawing();
}
function showReport(){
  $('review-materials').innerHTML=report.floors.map(f=>{
    const byMaterial=new Map();for(const r of f.rooms)byMaterial.set(r.material,(byMaterial.get(r.material)||0)+r.area);
    return `<h2>${f.level} 层 · 模型范围</h2><dl>${[...byMaterial].map(([name,area])=>`<dt>${e(name)}矩形面积</dt><dd>${area.toFixed(2)} ㎡</dd>`).join('')}<dt>已建模踢脚线净长</dt><dd>${f.quantities.skirting.toFixed(2)} m</dd></dl>`;
  }).join('')+`<p class="note">${e(report.quantities_basis)}。</p><h2>色板与常见规格比较</h2><p class="note">A 配色方向已确认，B 保留比较；实际产品与样板尚未确定。链接用于核对规格与资料，不代表已选品牌或已满足现场条件。</p>`+report.materials.map(m=>`<article class="review-item"><strong>${e(m.name)}</strong><p class="model-value">${e(m.model)}</p><p>${e(m.options)}</p><p class="note">待核：${e(m.check)}</p>${m.url?`<a class="action-link" href="${e(m.url)}" target="_blank" rel="noreferrer">${e(m.source)} ↗</a>`:''}</article>`).join('');
  $('review-pending').innerHTML=`<p class="note">${e(report.mobile_acceptance.note)}</p>`+report.pending.map(p=>`<article class="review-item"><span class="status">${e(p.scope)}</span><h2>${e(p.title)}</h2><p class="model-value">方案已做：${e(p.model)}</p><p>需补：${e(p.required)}</p><p class="note">影响：${e(p.affects)}</p></article>`).join('');
}
async function init(){
  [parameters,...plans]=await Promise.all(['/house_parameters.json','/plan_floor_1.json','/plan_floor_2.json'].map(async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`无法读取 ${path}`);return response.json();}));
  if(auditDimensions(parameters,plans).data_status!=='pass')throw new Error('参数与平面存在冲突，暂停出图；请先在尺寸校核页面检查。');
  report=designReview(parameters,plans);showFloor();showReport();
  $('building-detail').innerHTML=report.building_details.items.map(item=>`<option value="${item.id}">${e(item.name)}</option>`).join('');showBuilding();
  if(['equipment','building','materials','pending'].includes(query.get('panel')))activatePanel(query.get('panel'));
  $('building-detail').addEventListener('change',event=>{detailId=event.target.value;showBuilding();});
  $('building-candidate').addEventListener('change',drawing);
  $('review-room-details').addEventListener('click',event=>{const id=event.target.closest('[data-room-detail]')?.dataset.roomDetail;if(id){detailId=id;$('building-detail').value=id;showBuilding();activatePanel('building');document.querySelector('aside').scrollTop=0;$('drawing').scrollIntoView({block:'nearest'});}});
  $('plan-floor').addEventListener('change',event=>{floor=Number(event.target.value);showFloor();});
  $('review-room').addEventListener('change',event=>{selected=event.target.value;showRoom();});
  for(const id of ['plan-mode','plan-dimensions','plan-zones','plan-services','plan-equipment'])$(id).addEventListener('change',drawing);
  $('plan-overview').addEventListener('click',()=>{zoom=false;drawing();});$('plan-zoom').addEventListener('click',()=>{zoom=true;drawing();});
  const select=event=>{const id=event.target.closest('[data-room]')?.dataset.room;if(id&&roomsNow().some(r=>r.id===id)){selected=id;showRoom();}};
  $('drawing').addEventListener('click',select);$('drawing').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select(event);}});
  document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>activatePanel(button.dataset.panel)));
  $('review-equipment').addEventListener('click',event=>{const id=event.target.closest('[data-equipment-room]')?.dataset.equipmentRoom;if(id){selected=id;zoom=true;showRoom();activatePanel('room');document.querySelector('aside').scrollTop=0;$('drawing').scrollIntoView({block:'nearest'});}});
  $('plan-export').addEventListener('click',()=>download(activePanel==='building'?`小院-${detailId}-候选节点.svg`:`小院-${floor}层-${zoom?roomNow().label:'整层'}-方案尺寸.svg`,$('drawing').firstElementChild.outerHTML,'image/svg+xml;charset=utf-8'));
  $('plan-print').addEventListener('click',()=>window.print());
  for(const id of ['review-export','equipment-export','building-export'])$(id).addEventListener('click',()=>download('小院-装修方案复核.json',JSON.stringify(report,null,2),'application/json'));
}
init().catch(error=>{$('drawing').textContent='尺寸图暂不可用';$('review-error').hidden=false;$('review-error').textContent=error.message;});
