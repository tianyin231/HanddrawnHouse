import {solarPosition,prepareSunBlockers,directSunSamples,centerSunDiagnostic} from './solar-study.js';
import {summarizeObstructions} from './solar-obstructions.js';

export const DAILY_STEP_MINUTES=10;
export const minuteLabel=minute=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(Math.round(minute%60)).padStart(2,'0')}`;

export function summarizeSunBins(bins) {
  let centerMinutes=0,meanMinutes=0;
  const intervals=[];
  for(const bin of bins) {
    const duration=bin.end-bin.start;
    meanMinutes+=duration*bin.direct/bin.total;
    if(!bin.center)continue;
    centerMinutes+=duration;
    const last=intervals.at(-1);
    if(last&&last.end===bin.start)last.end=bin.end;
    else intervals.push({start:bin.start,end:bin.end});
  }
  return {centerMinutes,meanMinutes:Math.round(meanMinutes*100)/100,longestMinutes:Math.max(0,...intervals.map(v=>v.end-v.start)),intervals};
}

// 每个 10 分钟时段只算中点，汇总的是几何可见时段，绝不是照度或法规验收。
// 分批让出主线程，改条件/切视图时可取消；已采样结果不会覆盖新条件。
export async function dailySunStudy({date,location,targets,objects,conditions,signal,onProgress=()=>{},yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}) {
  const blocked=prepareSunBlockers(objects),windows=targets.map(target=>({id:target.id,label:target.label,level:target.level,space:target.space,face:target.face,
    points_m:target.points.map(p=>p.toArray()),normal:target.normal.toArray(),bins:[]}));
  for(let start=0;start<1440;start+=DAILY_STEP_MINUTES) {
    if(signal?.aborted)throw new DOMException('计算已取消','AbortError');
    const end=Math.min(1440,start+DAILY_STEP_MINUTES),minute=(start+end)/2;
    const solar=solarPosition(date,minute/60,location),samples=directSunSamples(targets,solar,blocked);
    samples.forEach((sample,i)=>windows[i].bins.push({start,end,sampled_at:minute,direct:sample.direct,total:sample.total,center:sample.center,
      center_diagnostic:centerSunDiagnostic(targets[i],solar,blocked)}));
    if(end%30===0){onProgress(end/1440);await yieldTask();}
  }
  if(signal?.aborted)throw new DOMException('计算已取消','AbortError');
  for(const window of windows)Object.assign(window,summarizeSunBins(window.bins),{obstructions:summarizeObstructions(window.bins)});
  return {schema_version:2,status:'scenario_not_surveyed',engineering_acceptance:'not_assessed',date,location:{...location},step_minutes:DAILY_STEP_MINUTES,
    method:'NOAA 年角近似太阳位置；每 10 分钟时段取中点；窗外 3×3 样点射线遮挡，中心点与九点平均分别统计',
    coordinates:'米；X 向图纸右、Y 竖直向上、Z 向图纸下；窗向按图纸上北标记，实际北向偏角另记录',
    limitations:['太阳点光源，未计折射、气象、天空漫射、玻璃透射与室内反射。','样点在墙外 30 mm，只算当前实体遮挡；不能当作光透过窗后形成的室内照度或有效采光面积。','场地、邻房和北向尚未实测；简化邻房体块、模型屋檐及植物实体参与遮挡。','时段界线由离散采样近似，短于采样间隔的遮挡可能遗漏；不提供法规达标判断。','遮挡归因按中心点向太阳的最近命中构件统计；忽略整类构件仅作敏感性参照，保留其余遮挡，不是可施工的改造收益。'],
    conditions:structuredClone(conditions),windows};
}
