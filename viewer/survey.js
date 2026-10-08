import {auditDimensions,BASIS_LABELS,validateMeasurement,measurementComparison,parseMeasurementFile,toCSV} from './dimension-audit.js';
const $=id=>document.getElementById(id);
const KEY='HanddrawnHouse:measurements:v1';
const NS='http://www.w3.org/2000/svg';
let report,parameters,plans,records=[],floor=1,selected='master-bedroom',editing=null;
const number=value=>value===null||value===undefined?'待测':Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2});
const size=values=>values.map(v=>(v/1000).toFixed(2)).join(' × ')+' m';
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function svg(tag,attributes={},text){const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;}
function message(text,warning=false){$('storage-message').textContent=text;$('storage-message').classList.toggle('warning',warning);}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=el('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function saveRecords(){try{localStorage.setItem(KEY,JSON.stringify({schema_version:1,records}));message('已保存在此浏览器。记录未应用到模型；请导出 JSON 备份或转移到其他设备。');}catch{message('浏览器未能持久保存。记录仍在本页，请立即导出 JSON；关闭或刷新页面会丢失未保存数据。',true);}}
function drawPlan(){
  const host=$('plan');host.replaceChildren();
  if(report.data_status!=='pass'){host.append(el('p','数据存在冲突，暂停绘制尺寸示意。请先按检查结果修正或重新生成平面。','alert'));return;}
  const plan=plans.find(p=>p.level===floor),w=parameters.site_width/1000,total=(parameters.house_depth+parameters.courtyard_depth)/1000;
  const y0=parameters.courtyard_depth/1000;
  const xy=([x,y])=>[x/1000,total-y/1000];
  const points=polygon=>polygon.map(p=>xy(p).join(',')).join(' ');
  const drawing=svg('svg',{viewBox:`-1.6 -1.5 ${w+3.2} ${total+2.7}`,class:'plan-svg',role:'group','aria-label':`${floor} 层尺寸示意图，可选择房间`});
  const defs=svg('defs');const grid=svg('pattern',{id:'grid',width:1,height:1,patternUnits:'userSpaceOnUse'});
  grid.append(svg('path',{d:'M 1 0 L 0 0 0 1',fill:'none',stroke:'#e8ece3','stroke-width':.025}));defs.append(grid);drawing.append(defs);
  drawing.append(svg('rect',{x:0,y:0,width:w,height:total,fill:'url(#grid)'}));
  if(floor===2){drawing.append(svg('rect',{x:0,y:total-y0,width:w,height:y0,fill:'#f0f3eb',stroke:'#b5c1b2','stroke-width':.05,'stroke-dasharray':'.18 .15'}));drawing.append(svg('text',{x:w/2,y:total-y0/2,'text-anchor':'middle','font-size':.55,fill:'#73846e'},'前院上方挑空 · 无楼板'));}
  const labels=[];
  for(const space of plan.spaces){
    const focused=space.id===selected;
    const polygon=svg('polygon',{points:points(space.polygon),fill:focused?'#c5d9bc':space.id==='courtyard'?'#e5ecdc':'#f4f2e8',stroke:focused?'#427655':'#d9dfd2','stroke-width':focused?.075:.025,class:'space',tabindex:0,role:'button','aria-label':`${space.label}，查看尺寸`,'aria-pressed':focused});
    const choose=()=>{selected=space.id;renderRoom();drawPlan();};
    polygon.addEventListener('click',choose);polygon.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});drawing.append(polygon);
    const xs=space.polygon.map(p=>p[0]),ys=space.polygon.map(p=>p[1]);
    let position=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
    if(space.id==='courtyard')position=[4200,3400];
    if(space.id==='stairwell')position=[12400,8600];
    const [x,y]=xy(position);
    const text=svg('text',{x,y,'text-anchor':'middle','dominant-baseline':'central','font-size':(Math.max(...xs)-Math.min(...xs)<1800)?.3:.42,fill:focused?'#244e39':'#687365'},space.label);
    labels.push(text);
  }
  const walls=new Map(plan.walls.map(wall=>[wall.id,wall]));
  for(const wall of walls.values()){const [a,b]=[xy(wall.a),xy(wall.b)];drawing.append(svg('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#58685c','stroke-width':wall.thickness/1000}));}
  for(const opening of plan.openings){const wall=walls.get(opening.wall_id),length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);const along=distance=>xy(wall.a.map((v,i)=>v+(wall.b[i]-v)*distance/length));const [a,b]=[along(opening.offset),along(opening.offset+opening.width)];const attr={x1:a[0],y1:a[1],x2:b[0],y2:b[1]};drawing.append(svg('line',{...attr,stroke:'#fff','stroke-width':wall.thickness/1000+.035}));drawing.append(svg('line',{...attr,stroke:opening.kind==='window'?'#4c93a5':'#b58651','stroke-width':.065}));}
  drawing.append(...labels);
  drawing.append(svg('line',{x1:0,y1:-.65,x2:w,y2:-.65,stroke:'#80927e','stroke-width':.04}));
  for(const x of [0,w])drawing.append(svg('line',{x1:x,y1:-.85,x2:x,y2:-.45,stroke:'#80927e','stroke-width':.04}));
  drawing.append(svg('text',{x:w/2,y:-.86,'text-anchor':'middle','font-size':.46,fill:'#57705a'},`总宽约 ${w.toFixed(2)} m · 外缘`));
  drawing.append(svg('text',{x:-.75,y:1,'font-size':.48,fill:'#57705a'},'北↑'));
  drawing.append(svg('text',{x:w/2,y:total+.72,'text-anchor':'middle','font-size':.4,fill:'#71816b'},`主体 ${(parameters.house_depth/1000).toFixed(2)} m + 前院 ${y0.toFixed(2)} m · 含墙`));
  host.append(drawing);
}
function renderRoom(){
  const rooms=report.rooms.filter(r=>r.level===floor);
  if(!rooms.some(r=>r.id===selected))selected=rooms[0]?.id;
  $('room-select').replaceChildren(...rooms.map(room=>{const option=el('option',room.label);option.value=room.id;return option;}));
  $('room-select').value=selected??'';
  const room=rooms.find(r=>r.id===selected);
  $('room-title').textContent=room?.label??'无可用房间数据';
  $('nominal').textContent=room?size(room.nominal_mm):'待修正';$('clear').textContent=room?size(room.estimated_clear_mm):'待修正';
}
function renderLedger(){
  const tbody=$('ledger');tbody.replaceChildren();
  const group=$('group-filter').value;
  for(const field of report.measurements.filter(f=>!group||f.group===group)){
    const record=records.find(r=>r.id===field.id),comparison=measurementComparison(field,record);
    const tr=el('tr');tr.dataset.field=field.id;
    const title=el('td');title.append(el('strong',field.label),el('small',field.method));
    const current=el('td',field.current===null?'待测':`${number(field.current)} ${field.unit}`);
    const basis=el('td',field.status);basis.append(el('small',BASIS_LABELS[field.basis]));
    const measured=el('td');
    if(record){measured.append(el('span',`${number(record.value)} ${field.unit}`,'record-value'),el('small',comparison.label,comparison.state==='recorded'?'':'record-warning'));
      if(comparison.delta!==null)measured.append(el('small',`相对模型 ${comparison.delta>0?'+':''}${number(comparison.delta)} ${field.unit}（非误差验收）`));
      measured.append(el('small',`${record.measured_at} · ${record.recorder}`));
    }else measured.textContent='未记录';
    const action=el('td'),button=el('button',record?'查看／修改':'录入');button.type='button';button.setAttribute('aria-label',`${record?'查看或修改':'录入'}${field.label}`);button.addEventListener('click',()=>openRecord(field));action.append(button);
    tr.append(title,current,basis,measured,action);tbody.append(tr);
  }
  $('record-count').textContent=`${records.length} / ${report.measurements.length} 项已记录 · 均未应用`;
}
function openRecord(field){
  editing=field;const record=records.find(r=>r.id===field.id);
  $('record-title').textContent=field.label;$('record-method').textContent=`${field.method}。模型：${number(field.current)} ${field.unit}；${BASIS_LABELS[field.basis]}。`;
  $('value-label').textContent=`实测值（${field.unit}，不自动换算）`;$('measured-value').value=record?.value??'';
  $('measured-value').step=field.unit==='级'?'1':'any';
  $('measured-basis').value=record?.basis??field.basis;
  const now=new Date();const localDate=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $('measured-date').value=record?.measured_at??localDate;$('measured-by').value=record?.recorder??'';
  $('measured-reference').value=record?.reference??'';$('measured-note').value=record?.note??'';
  $('form-error').hidden=true;$('remove-record').hidden=!record;$('record-dialog').showModal();$('measured-value').focus();
}
function exportChecklist(){
  const rows=[['类型','楼层','ID','测量项','当前模型值','单位','口径／依据','现场实测／待填写','量取说明','测量人','日期','测点／照片','备注']];
  for(const f of report.measurements){const r=records.find(r=>r.id===f.id);rows.push(['参数／现场项','',f.id,f.label,f.current,f.unit,`${BASIS_LABELS[f.basis]}；${f.status}`,r?.value??'',f.method,r?.recorder??'',r?.measured_at??'',r?.reference??'',r?`记录口径：${BASIS_LABELS[r.basis]}；未应用；${r.note}`:'']);}
  for(const r of report.rooms)rows.push(['房间',r.level,r.id,r.label,`含墙 ${r.nominal_mm.join(' × ')}；扣墙估算 ${r.estimated_clear_mm.join(' × ')}`,'mm','估算，非完成面实测','','记录完成面宽／深；柱、饰面及局部障碍另注','','','',r.note]);
  for(const o of report.openings)rows.push(['洞口',o.level,o.id,`${o.kind==='window'?'窗':'门'}／${o.wall}`,`偏移 ${o.offset}；宽 ${o.width}；底标高 ${o.sill}；顶标高 ${o.head}`,'mm','结构洞口设计建议','','记录墙端起点、净洞宽高、窗台及开扇；不是成品规格','','','','']);
  download('HanddrawnHouse-现场复测清单.csv',toCSV(rows),'text/csv;charset=utf-8');
}
async function load(){
  try{
    const urls=['/house_parameters.json','/plan_floor_1.json','/plan_floor_2.json'];
    const values=await Promise.all(urls.map(async url=>{const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${url} 读取失败（${response.status}）`);return response.json();}));
    [parameters,...plans]=values;report=auditDimensions(parameters,plans);
    $('audit-status').textContent=report.data_status==='pass'?'未发现数据冲突':`发现 ${report.issues.length} 项冲突`;
    $('counts').textContent=`本次读取两层平面：${report.rooms.length} 个空间、${report.openings.length} 个门窗洞口。`;
    if(report.issues.length)for(const issue of report.issues){const node=el('div',issue.message,'issue');node.append(el('small',[issue.level?`${issue.level} 层`:'参数',issue.entity,issue.code].filter(Boolean).join(' / ')));$('issues').append(node);}
    else $('issues').append(el('p','当前参数与可检查的平面字段一致。模型仍为待复核状态；现场数据尚未验证。'));
    for(const decision of report.missing_decisions)$('missing-decisions').append(el('li',decision));
    for(const group of new Set(report.measurements.map(f=>f.group))){const option=el('option',group);option.value=group;$('group-filter').append(option);}
    for(const [value,label] of Object.entries(BASIS_LABELS)){const option=el('option',label);option.value=value;$('measured-basis').append(option);}
    try{const stored=localStorage.getItem(KEY);if(stored)records=parseMeasurementFile(stored);}catch{message('已有记录无法读取或格式损坏，未自动覆盖。请先保留原始备份；本页仍可查看校核数据。',true);}
    renderRoom();drawPlan();renderLedger();$('content').hidden=false;
  }catch(error){$('audit-status').textContent='未能完成校核';$('load-error').hidden=false;$('load-error').textContent=`${error.message}。请通过 npm start 启动项目后打开本页，不要直接双击 HTML。`;}
}
for(const button of document.querySelectorAll('[data-floor]'))button.addEventListener('click',()=>{floor=Number(button.dataset.floor);for(const b of document.querySelectorAll('[data-floor]'))b.setAttribute('aria-pressed',String(b===button));renderRoom();drawPlan();});
$('room-select').addEventListener('change',()=>{selected=$('room-select').value;renderRoom();drawPlan();});
$('group-filter').addEventListener('change',renderLedger);
$('close-record').addEventListener('click',()=>$('record-dialog').close());
$('record-form').addEventListener('submit',event=>{
  event.preventDefault();if(!editing)return;
  const record={id:editing.id,value:Number($('measured-value').value),unit:editing.unit,basis:$('measured-basis').value,
    measured_at:$('measured-date').value,recorder:$('measured-by').value.trim(),reference:$('measured-reference').value.trim(),note:$('measured-note').value.trim(),baseline_value:editing.current};
  const error=validateMeasurement(record);if(error){$('form-error').textContent=error;$('form-error').hidden=false;return;}
  records=records.filter(r=>r.id!==record.id).concat(record);saveRecords();renderLedger();$('record-dialog').close();
});
$('remove-record').addEventListener('click',()=>{if(editing&&confirm(`删除「${editing.label}」的本地记录？`)){records=records.filter(r=>r.id!==editing.id);saveRecords();renderLedger();$('record-dialog').close();}});
$('export-records').addEventListener('click',()=>download('HanddrawnHouse-现场记录.json',JSON.stringify({schema_version:1,project:'HanddrawnHouse',records},null,2),'application/json'));
$('import-records').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>1000000)throw new Error('文件超过 1 MB，未导入。');
    const incoming=parseMeasurementFile(await file.text());
    const overlap=incoming.filter(r=>records.some(old=>old.id===r.id)).length;
    if(overlap&&!confirm(`有 ${overlap} 项与本地记录同名，将被导入记录替换。继续？`))return;
    const merged=new Map(records.map(r=>[r.id,r]));for(const record of incoming)merged.set(record.id,record);records=[...merged.values()];saveRecords();renderLedger();
  }catch(error){message(`导入失败：${error.message} 原有记录未更改。`,true);}finally{event.target.value='';}
});
$('export-csv').addEventListener('click',exportChecklist);
$('export-audit').addEventListener('click',()=>download('HanddrawnHouse-尺寸数据校核.json',JSON.stringify(report,null,2),'application/json'));
$('print').addEventListener('click',()=>{const old=$('group-filter').value;$('group-filter').value='';renderLedger();window.print();$('group-filter').value=old;renderLedger();});
load();
