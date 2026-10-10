import {blueprintSVG,escapeXML as e} from './blueprint.js';
import {designReview,ITEM_NAMES,maintenanceNotes} from './design-review-data.js';
import {auditDimensions} from './dimension-audit.js';

const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
let parameters,plans,report,floor=query.get('floor')==='2'?2:1,selected=query.get('room')||'hall',zoom=false;
const mm=value=>Math.round(value*1000).toLocaleString('zh-CN');
const roomsNow=()=>plans.find(p=>p.level===floor).spaces.filter(s=>s.id!=='courtyard');
const roomNow=()=>report.floors.find(f=>f.level===floor).rooms.find(r=>r.id===selected)||(()=>{
  const space=roomsNow().find(r=>r.id===selected),bounds=space.clear_bounds_mm.map(v=>v/1000);
  return {...space,bounds,area:(bounds[2]-bounds[0])*(bounds[3]-bounds[1]),material:'未计入装修用量',skirting:0,items:[],zones:[],services:[]};
})();
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function drawing(){
  const options={furnished:$('plan-mode').value==='furnished',dimensions:$('plan-dimensions').checked,zones:$('plan-zones').checked,services:$('plan-services').checked,selected,zoom};
  $('drawing').innerHTML=blueprintSVG(parameters,plans.find(p=>p.level===floor),options);
  $('plan-overview').setAttribute('aria-pressed',String(!zoom));$('plan-zoom').setAttribute('aria-pressed',String(zoom));
}
function showRoom(){
  const room=roomNow(),[x,y,x1,y1]=room.bounds;
  $('review-room').value=selected;$('review-room-name').textContent=room.label;
  $('review-room-size').textContent=`扣墙模型净界 ${mm(x1-x)} × ${mm(y1-y)} mm · ${room.area.toFixed(2)} ㎡`;
  const size=item=>`${mm(item.bounds[2]-item.bounds[0])} × ${mm(item.bounds[3]-item.bounds[1])} mm`;
  $('review-room-details').innerHTML=`<dl><dt>地面方案</dt><dd>${e(room.material)}</dd><dt>地面矩形净面积</dt><dd>${room.area.toFixed(2)} ㎡</dd><dt>已建模踢脚线净长</dt><dd>${room.skirting.toFixed(2)} m</dd></dl><p class="note">面积未减饰面厚度和柱等突出，踢脚线已扣门洞及门套让位；均不是下单数量。</p>
    <h2>家具与检修</h2>${room.items.length?room.items.map(item=>`<article class="review-item"><strong>${e(ITEM_NAMES[item.type])}</strong><p class="model-value">平面占位 ${size(item)}</p>${maintenanceNotes(item).map(v=>`<p>${e(v)}</p>`).join('')}</article>`).join(''):'<p class="note">保留现有用途，未布置专用家具。</p>'}
    <h2>使用范围</h2>${room.zones.map(z=>`<p class="model-value">${e(z.label)} · ${size(z)}</p>`).join('')||'<p class="note">此房间尚无单独使用区标记。</p>'}
    <h2>候选接点</h2>${room.services.map((s,i)=>`<article class="review-item"><strong>${i+1}. ${e(s.name)}</strong><p class="status">候选位置 · 未测量</p><p>相对本层模型地面高 ${mm(s.position[2])} mm</p><p>${e(s.condition)}</p></article>`).join('')||'<p class="note">未布置专用设备接点。电气、排风和空调条件见待确认清单。</p>'}
    <h2>与本房间相关的待确认项</h2><ul class="small-list">${report.pending.filter(v=>!v.rooms.length||v.rooms.includes(selected)).map(v=>`<li>${e(v.title)} · ${e(v.scope)}</li>`).join('')}</ul>`;
  const url=new URL(location);url.searchParams.set('floor',floor);url.searchParams.set('room',selected);history.replaceState(null,'',url);
  drawing();
}
function showFloor(){
  const rooms=roomsNow();
  if(!rooms.some(r=>r.id===selected))selected='hall';
  $('plan-floor').value=floor;$('review-room').innerHTML=rooms.map(r=>`<option value="${e(r.id)}">${e(r.label)}</option>`).join('');showRoom();
}
function showReport(){
  $('review-materials').innerHTML=report.floors.map(f=>{
    const byMaterial=new Map();for(const r of f.rooms)byMaterial.set(r.material,(byMaterial.get(r.material)||0)+r.area);
    return `<h2>${f.level} 层 · 模型范围</h2><dl>${[...byMaterial].map(([name,area])=>`<dt>${e(name)}矩形面积</dt><dd>${area.toFixed(2)} ㎡</dd>`).join('')}<dt>已建模踢脚线净长</dt><dd>${f.quantities.skirting.toFixed(2)} m</dd></dl>`;
  }).join('')+`<p class="note">${e(report.quantities_basis)}。</p><h2>色板与常见规格比较</h2><p class="note">A 沿用当前深化方向，B 保留比较，均未确定采购。链接用于核对规格与资料，不代表已选品牌或已满足现场条件。</p>`+report.materials.map(m=>`<article class="review-item"><strong>${e(m.name)}</strong><p class="model-value">${e(m.model)}</p><p>${e(m.options)}</p><p class="note">待核：${e(m.check)}</p>${m.url?`<a class="action-link" href="${e(m.url)}" target="_blank" rel="noreferrer">${e(m.source)} ↗</a>`:''}</article>`).join('');
  $('review-pending').innerHTML=report.pending.map(p=>`<article class="review-item"><span class="status">${e(p.scope)}</span><h2>${e(p.title)}</h2><p class="model-value">方案已做：${e(p.model)}</p><p>需补：${e(p.required)}</p><p class="note">影响：${e(p.affects)}</p></article>`).join('');
}
async function init(){
  [parameters,...plans]=await Promise.all(['/house_parameters.json','/plan_floor_1.json','/plan_floor_2.json'].map(async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`无法读取 ${path}`);return response.json();}));
  if(auditDimensions(parameters,plans).data_status!=='pass')throw new Error('参数与平面存在冲突，暂停出图；请先在尺寸校核页面检查。');
  report=designReview(parameters,plans);showFloor();showReport();
  $('plan-floor').addEventListener('change',event=>{floor=Number(event.target.value);showFloor();});
  $('review-room').addEventListener('change',event=>{selected=event.target.value;showRoom();});
  for(const id of ['plan-mode','plan-dimensions','plan-zones','plan-services'])$(id).addEventListener('change',drawing);
  $('plan-overview').addEventListener('click',()=>{zoom=false;drawing();});$('plan-zoom').addEventListener('click',()=>{zoom=true;drawing();});
  const select=event=>{const id=event.target.closest('[data-room]')?.dataset.room;if(id&&roomsNow().some(r=>r.id===id)){selected=id;showRoom();}};
  $('drawing').addEventListener('click',select);$('drawing').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select(event);}});
  document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-panel]').forEach(b=>{const active=b===button;b.setAttribute('aria-pressed',String(active));$(`panel-${b.dataset.panel}`).hidden=!active;});}));
  $('plan-export').addEventListener('click',()=>download(`小院-${floor}层-${zoom?roomNow().label:'整层'}-方案尺寸.svg`,$('drawing').firstElementChild.outerHTML,'image/svg+xml;charset=utf-8'));
  $('plan-print').addEventListener('click',()=>window.print());
  $('review-export').addEventListener('click',()=>download('小院-装修方案复核.json',JSON.stringify(report,null,2),'application/json'));
}
init().catch(error=>{$('drawing').textContent='尺寸图暂不可用';$('review-error').hidden=false;$('review-error').textContent=error.message;});
