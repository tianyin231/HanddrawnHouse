import {escapeXML as e} from './blueprint.js';

// 原创关系图，不按比例。蓝色候选层不回写建筑实体或产品尺寸。
export function buildingDetailSVG(item,showCandidate=true) {
  const label=(x,y,text)=>`<text x="${x}" y="${y}" font-size="20">${e(text)}</text>`;
  const line=(d,kind='existing')=>`<path d="${d}" class="${kind}"/>`;
  const water=d=>`<path d="${d}" class="water" marker-end="url(#flow)"/>`;
  let shape='',candidate='',flow='';
  if(item.id==='eaves') {
    shape=`<path class="body" d="M220 350L750 191V228L220 387Z"/><path class="body" d="M620 267L710 240V445H620Z"/>`+
      line('M100 330V418H226V370')+line('M160 418V503M191 418V503');
    for(let x=220;x<745;x+=78){const y=323-(x-220)*.30;shape+=`<path class="tile" d="M${x-15} ${y}l93 -28v13l-93 28Z"/>`;}
    shape+=label(40,140,'① 瓦面与屋面体')+line('M230 143H300L375 258','leader')+
      label(595,491,'④ 檐沟接雨水管')+line('M590 484H345L196 453','leader');
    candidate=line('M745 181L227 336L180 365L155 366','candidate')+
      line('M255 342L205 358L174 382','candidate')+
      label(560,120,'② 候选瓦下排水层')+line('M685 128V170','guide')+
      label(295,524,'③ 檐口支承与导水')+line('M310 502L278 401L225 354','guide');
    flow=water('M415 207L313 238L184 339')+water('M165 435V535');
  } else if(item.id==='annex-edge') {
    shape=`<path class="body" d="M265 222H365V487H265Z"/><path class="body" d="M365 430L800 458V487H365Z"/><path class="cap" d="M253 203H377V222H253Z"/>`+
      label(45,151,'① 已有围边与压顶')+line('M250 158L285 199','leader')+
      label(545,521,'④ 最终保护层另行扣除')+line('M650 499V458','leader');
    candidate=line('M800 445L383 417Q375 417 375 406V229Q375 218 365 216H265Q255 217 255 230V259','candidate')+
      line('M242 231V192L388 203V236','candidate')+
      label(555,151,'② 连续上翻、收头受保护')+line('M590 158H462L380 292','guide')+
      label(45,345,'③ 压顶接缝与断水待选')+line('M245 318L240 238','guide');
    flow=water('M283 177L388 187L413 217')+water('M470 396L639 407');
  } else if(item.id==='annex-drain') {
    shape=`<path class="body" d="M130 318L420 390V483H130Z"/><path class="body" d="M555 390L845 318V483H555Z"/>`+
      line('M438 422V526M465 435V526M510 435V526M537 422V526')+
      label(40,149,'① 现有找坡面与通孔')+line('M260 157V250L321 358','leader')+
      label(600,521,'④ 现有内落水管')+line('M590 513H540','leader');
    candidate=line('M130 305L418 378L450 408V441M845 305L557 378L523 408V441','candidate')+
      line('M402 389H466V414M573 389H508V414','candidate')+
      line('M431 376Q431 324 487 324Q542 324 542 376M452 373V338M487 373V325M521 373V338','candidate')+
      label(538,150,'② 候选可拆滤罩')+line('M640 159V274L520 328','guide')+
      label(42,522,'③ 防水与斗口专用连接')+line('M300 512L399 412','guide');
    flow=water('M230 271L410 324')+water('M739 271L566 323')+water('M487 443V543');
  } else if(item.id==='wet-floor') {
    shape=`<path class="body" d="M170 195H245V485H170Z"/><path class="body" d="M245 430H567V485H245ZM670 430H860V485H670Z"/>`+
      line('M567 430V458H670V430')+line('M585 430H603M615 430H633M646 430H664')+
      label(45,155,'① 墙面与地面饰面')+line('M244 162L213 252','leader')+
      label(550,520,'② 齐平篦盖，下方仅为浅凹')+line('M733 498L652 461','leader');
    candidate=line('M254 204V435Q254 445 267 445H550L579 453M660 453L688 445H860','candidate')+
      line('M586 459V490M650 459V490','candidate')+
      label(365,159,'③ 墙脚与地漏连接连续')+line('M571 168V256L269 442','guide')+
      label(45,520,'④ 找坡、降板和接管空间待核')+line('M358 506L540 470','guide');
    flow=water('M367 386L536 419')+water('M811 394L706 419');
  } else if(item.id==='wet-entry') {
    shape=`<path class="body" d="M140 429H865V485H140Z"/><rect class="cap" x="464" y="206" width="24" height="207"/><rect x="719" y="258" width="10" height="170" fill="#b7cdca" stroke="#638a87"/>`+
      label(140,184,'相邻干区')+label(587,184,'卫浴与开放淋浴')+
      label(68,520,'① 当前过门面等高，未表达挡水高差')+line('M358 500L460 434','leader')+
      label(599,230,'② 固定玻璃，入口开放')+line('M745 237V255','leader');
    candidate=line('M185 447H865','candidate')+line('M435 409V465H523V409Z','candidate')+
      label(83,324,'③ 门口与两侧墙脚收头')+line('M330 332L454 427','guide')+
      label(553,360,'④ 挡水门槛 / 坡差待选')+line('M563 368L510 423','guide');
    flow=water('M764 399H839');
  } else if(item.id==='window-sill') {
    for(const [i,example] of item.examples.entries()) {
      const left=i?555:70,bottom=example.section[0][1]-.006,inside=example.section[0][0],outside=example.section[1][0];
      const x=a=>left+(a-inside)*1400,y=b=>315-(b-bottom)*1400,face=x(outside-example.projectionMm/1000);
      shape+=`<path class="body" d="M${left} 315H${face}V472H${left}Z"/><polygon points="${example.section.map(([a,b])=>`${x(a)},${y(b)}`).join(' ')}" fill="#a0aaa3" stroke="#5c7063" stroke-width="2"/>`+
        `<rect class="cap" x="${left+68}" y="203" width="28" height="108"/>`;
      candidate+=line(`M${left+49} 292V315L${x(outside)-12} ${y(example.section[1][1])-4}`,'candidate');
      flow+=water(`M${left+132} 272L${x(outside)+8} 315`);
    }
    shape+=label(45,514,'① 南窗出挑 35 mm，有外露滴水槽')+label(560,514,'② 贴界窗：不新增出挑');
    candidate+=label(303,145,'③ 窗底、端部与防水衔接待选')+line('M438 156L168 299','guide');
  } else if(item.id==='window-joint') {
    shape=`<path class="cap" d="M180 207H430V500H180Z"/><path class="body" d="M520 207H818V500H520Z"/>`+
      label(215,165,'① 窗框')+label(640,165,'② 外墙基层与饰面')+
      label(320,536,'接缝宽深未定，图中间隙不作尺寸依据');
    candidate=`<path class="candidate" d="M430 250Q475 275 520 250V274Q475 299 430 274Z"/><circle class="candidate" cx="475" cy="333" r="39"/>`+
      line('M430 458H520','candidate')+label(46,111,'③ 外侧密封胶，匹配两侧基层')+line('M304 122L463 256','guide')+
      label(571,329,'④ 背衬控制胶深')+line('M565 333H519','guide')+
      label(565,450,'⑤ 内侧气密另定')+line('M560 454L523 458','guide');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" class="building-section" role="img" aria-label="${e(item.name)}候选关系图" data-detail="${e(item.id)}">
    <title>${e(item.name)} · 方案节点，非施工图</title><desc>灰色为已有实体的简化剖面，蓝色虚线表示待定构造。图形不按比例，厚度和产品未选定。</desc>
    <defs><marker id="flow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#387e88"/></marker></defs>
    <style>text{font-family:'Microsoft YaHei UI',sans-serif;fill:#344940}.body{fill:#dddcd4;stroke:#7d8980;stroke-width:2}.tile{fill:#626a68;stroke:white;stroke-width:1}.cap{fill:#697773}.existing{stroke:#66766d;stroke-width:9;fill:none}.candidate{stroke:#287ba5;stroke-width:5;stroke-dasharray:11 6;fill:none}.water{stroke:#387e88;stroke-width:3;fill:none}.leader{stroke:#86978d;stroke-width:1.5;fill:none}.guide{stroke:#287ba5;stroke-width:1.5;fill:none}</style>
    <rect width="1000" height="650" fill="#fcfcf8"/><text x="35" y="44" font-size="27" font-weight="600">${e(item.name)}</text>
    <text x="35" y="76" font-size="16">关系示意 · 不按比例 · 不表示构造层厚度或已选产品</text>
    ${shape}<g data-candidate="${showCandidate}">${showCandidate?candidate+flow:''}</g>
    <path d="M35 578H75" class="existing"/><text x="90" y="585" font-size="17">现有实体的简化剖面</text>
    <path d="M370 578H420" class="candidate"/><text x="438" y="585" font-size="17">候选构造关系，未写入建筑实体</text>
    <text x="35" y="623" font-size="16">模型数据与待确认条件见侧栏；图纸可横向滑动，支持 SVG 导出。</text>
  </svg>`;
}
