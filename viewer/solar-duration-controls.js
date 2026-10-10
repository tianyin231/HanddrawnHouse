import {dailySunStudy,minuteLabel} from './solar-duration.js';

const durationLabel=minutes=>{const rounded=Math.round(minutes),hours=Math.floor(rounded/60),rest=rounded%60;return hours?`${hours} 小时${rest?` ${rest} 分`:''}`:`${rest} 分`;};
export const focusWindowIds=new Set(['1:south-master','1:hall-front-west','1:south-kitchen','1:north-middle-1','2:south-master','2:north-living-1']);
export function visibleWindowTargets(targets,group){return targets.filter(t=>group==='focus'?focusWindowIds.has(t.id):t.level===Number(group));}

export function setupSolarDuration({targets,scenario,objects,showTime,showObstruction,clearObstruction,valid}) {
  const $=id=>document.getElementById(id),button=$('solar-daily-run'),note=$('solar-daily-status'),host=$('solar-daily-results'),download=$('solar-daily-export');
  let report=null,controller=null,key='',active=false;
  function status(text,state){note.textContent=text;note.dataset.state=state;}
  function reset(text='条件已改变，请重新计算。',state='stale') {
    clearObstruction();
    controller?.abort();controller=null;report=null;host.replaceChildren();download.disabled=true;button.textContent='计算全天直射时段';status(text,state);
  }
  function draw(){
    host.replaceChildren();if(!report)return;
    const allowed=new Set(visibleWindowTargets(targets,$('solar-window-group').value).map(t=>t.id));
    for(const window of report.windows.filter(w=>allowed.has(w.id))) {
      const row=document.createElement('article');row.className='daily-window';
      const title=document.createElement('strong');title.textContent=window.label;
      const value=document.createElement('p');value.textContent=`中心点约 ${durationLabel(window.centerMinutes)}`;value.className='daily-total';
      const meta=document.createElement('p');meta.className='solar-note';meta.textContent=`九点平均 ${durationLabel(window.meanMinutes)} · 中心最长连续 ${durationLabel(window.longestMinutes)}`;
      const bar=document.createElement('div');bar.className='daily-timeline';bar.setAttribute('aria-label',`${window.label}中心点直射时段`);
      for(const interval of window.intervals) {
        const item=document.createElement('button');item.style.left=`${interval.start/14.4}%`;item.style.width=`${(interval.end-interval.start)/14.4}%`;
        const label=`${minuteLabel(interval.start)}–${minuteLabel(interval.end)}`;item.title=label;item.setAttribute('aria-label',`${window.label}，查看 ${label}`);
        item.addEventListener('click',()=>showTime((interval.start+interval.end)/2));bar.append(item);
      }
      const ticks=document.createElement('div');ticks.className='daily-ticks';for(const hour of ['00','06','12','18','24']){const tick=document.createElement('span');tick.textContent=hour;ticks.append(tick);}
      const ranges=document.createElement('p');ranges.className='daily-ranges';ranges.textContent=window.intervals.length?window.intervals.map(v=>`${minuteLabel(v.start)}–${minuteLabel(v.end)}`).join(' / '):'中心点在采样时段未见直射';
      row.append(title,value,meta,bar,ticks,ranges);host.append(row);
      const details=document.createElement('details');details.className='daily-obstructions';
      const summary=document.createElement('summary');summary.textContent='查看遮挡来源与参照';details.append(summary);
      const overview=document.createElement('p');overview.textContent=`白天背向太阳 ${durationLabel(window.obstructions.backFacingMinutes)} · 被构件遮挡 ${durationLabel(window.obstructions.blockedMinutes)}`;
      details.append(overview);
      for(const group of window.obstructions.groups) {
        const item=document.createElement('div');item.className='obstruction-entry';
        const inspect=document.createElement('button');inspect.className='obstruction-inspect';
        inspect.textContent=`${group.label} · ${durationLabel(group.nearestMinutes)}`;
        inspect.setAttribute('aria-label',`${window.label}：查看${group.label}遮挡`);
        inspect.addEventListener('click',()=>{
          const bin=window.bins.find(b=>b.sampled_at===group.exampleMinute);
          showTime(bin.sampled_at);showObstruction(window,bin);
        });
        const comparison=document.createElement('p');comparison.textContent=`仅忽略此类：中心点 ${durationLabel(window.centerMinutes)} → ${durationLabel(window.centerMinutes+group.withoutGroupGainMinutes)}`;
        item.append(inspect,comparison);details.append(item);
      }
      const method=document.createElement('p');method.className='solar-note';
      method.textContent=window.obstructions.groups.length?'按最近命中构件归因，点击可看代表时刻的路径。“仅忽略此类”保留其余遮挡，是诊断参照，不能相加或直接当作改造收益。':'本日没有迎光后被构件挡住的中心点采样；背向太阳与夜晚均不归因于邻房或屋檐。';
      details.append(method);row.append(details);
    }
  }
  async function run() {
    if(controller){reset('计算已停止。','cancelled');return;}
    if(!active||!valid())return;
    const current=new AbortController();controller=current;report=null;host.replaceChildren();download.disabled=true;button.textContent='停止计算';status('正在逐时段检查屋檐、楼梯和邻房遮挡…','running');
    clearObstruction();
    const inputs=scenario();
    try {
      const result=await dailySunStudy({...inputs,targets,objects:objects(),signal:current.signal,onProgress:progress=>{
        if(controller===current)status(`正在计算 ${Math.round(progress*100)}% · 可以继续旋转查看模型`,'running');
      }});
      if(controller!==current)return;
      report=result;controller=null;button.textContent='重新计算全天';download.disabled=false;
      status(`${report.date} · 已计算 ${report.windows.length} 扇窗 · 10 分钟采样，暂定条件`,'ready');draw();
    } catch(error) {
      if(controller!==current)return;
      if(error.name==='AbortError')reset('计算已停止。','cancelled');
      else reset(`计算未完成：${error.message}`,'error');
    }
  }
  button.addEventListener('click',run);
  $('solar-window-group').addEventListener('change',draw);
  download.addEventListener('click',()=>{
    if(!report)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=`小院-窗外直射估算-${report.date}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  });
  return {
    sync(nextKey,enabled){
      if(nextKey!==key||active!==enabled){if(report||controller)reset(enabled?'日期、模型或邻房条件改变，请重新计算。':'已退出日照模式，本次结果已清除。');key=nextKey;active=enabled;}
    },
    invalidate:()=>reset(),draw
  };
}
