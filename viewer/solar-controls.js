import * as THREE from 'three';
import {solarPosition, createNeighbors, neighborLayout, windowSamples, directSunSamples, NEIGHBOR_DEFAULTS} from './solar-study.js';
import {minuteLabel} from './solar-duration.js';
import {setupSolarDuration,visibleWindowTargets} from './solar-duration-controls.js';
import {setupSolarRayPreview} from './solar-ray-preview.js';

export function setupSolarControls({parameters, plans, state, scene, roots, skyLight, sunLight, renderer, ground, gardenLights, gardenEmitters, refresh, render}) {
  const $ = selector => document.querySelector(selector);
  let neighbors, timer,sceneVersion=0;
  const targets = windowSamples(parameters, plans);
  const location = {...parameters.solar_location};
  const heights = {...NEIGHBOR_DEFAULTS};
  $('#solar-latitude').value = location.latitude;
  $('#solar-longitude').value = location.longitude;
  $('#solar-north').value = location.north_rotation_deg;
  const rebuildNeighbors = () => {
    if(neighbors) {
      scene.remove(neighbors);
      neighbors.traverse(obj=>{obj.geometry?.dispose(); obj.material?.dispose();});
    }
    neighbors = createNeighbors(parameters, heights);
    scene.add(neighbors);
    neighbors.visible = false;
  };
  rebuildNeighbors();

  const valid=(showMessage=false)=>{
    const invalid=[...document.querySelectorAll('#solar-controls input[required]')].find(input=>!input.checkValidity());
    if(invalid){if(showMessage)invalid.reportValidity();duration.invalidate();return false;}return true;
  };
  function objects(){
    scene.updateMatrixWorld(true);const result=[];
    for(const root of [...roots.values(),neighbors])root.traverseVisible(obj=>{
      if(obj.isMesh&&obj.castShadow&&!obj.userData.glazing_proxy)result.push(obj);
    });
    return result;
  }
  function movablePoses(){
    const poses=[];
    for(const [level,root] of roots)root.traverseVisible(obj=>{
      if(!obj.userData.motion)return;
      const motion=typeof obj.userData.motion==='string'?JSON.parse(obj.userData.motion):obj.userData.motion;
      poses.push({level,id:motion.id,position:obj.position.toArray(),quaternion:obj.quaternion.toArray()});
    });
    return poses;
  }
  const rayPreview=setupSolarRayPreview({scene,objects,render});
  const duration=setupSolarDuration({targets,valid:()=>valid(true),objects,showObstruction:rayPreview.show,clearObstruction:rayPreview.clear,
    scenario:()=>({date:$('#solar-date').value,location:{...location},conditions:{model_parameters:parameters,neighbors_enabled:$('#solar-neighbors').checked,
      neighbors:neighborLayout(parameters,heights),neighbor_base_elevation_m:-parameters.entrance_proposal.yard_drop_mm/1000,
      garden_visible:state.garden,gate_open:state.gateOpen,movable_parts:movablePoses(),scene_revision:sceneVersion,site_status:'not_surveyed'}}),
    showTime:minute=>{$('#solar-hour').value=minute;refresh(false);}
  });

  function sample(solar) {
    const result=directSunSamples(visibleWindowTargets(targets,$('#solar-window-group').value),solar,objects());
    $('#solar-samples').replaceChildren(...result.map(item=>{
      const row=document.createElement('div');
      const label=document.createElement('span'), value=document.createElement('strong');
      label.textContent=item.label; value.textContent=`${item.direct} / ${item.total}`;
      row.append(label,value); return row;
    }));
    $('#solar-samples').dataset.status='ready';
  }

  function applyLighting() {
    rayPreview.clear();
    if(state.solar && (state.cut || !state.roof || !['whole','courtyard'].includes(state.view))) state.solar=false;
    $('#solar-enabled').checked=Boolean(state.solar);
    document.body.classList.toggle('sun-study-active',Boolean(state.solar));
    $('#solar-controls').hidden=!state.solar;
    $('#solar-badge').hidden=!state.solar;
    neighbors.visible=Boolean(state.solar && $('#solar-neighbors').checked);
    duration.sync(JSON.stringify([$('#solar-date').value,location,heights,$('#solar-neighbors').checked,state.garden,state.gateOpen,sceneVersion]),Boolean(state.solar));
    clearTimeout(timer);
    if(!state.solar) return false;
    if(!valid()){$('#solar-position').textContent='请补全有效的日期和场地条件。';$('#solar-samples').replaceChildren();$('#solar-samples').dataset.status='invalid';return false;}
    const minute=Number($('#solar-hour').value),hour=minute/60;
    const solar=solarPosition($('#solar-date').value,hour,location);
    const time=minuteLabel(minute);
    $('#solar-time').textContent=time;
    $('#solar-position').textContent=`太阳高度 ${solar.altitude.toFixed(1)}° · 方位 ${solar.azimuth.toFixed(1)}°`;
    $('#solar-badge').textContent=`${$('#solar-date').value} ${time} 北京时间 · ${solar.altitude>0?'日照对比':'太阳在地平线下'}`;
    const up=solar.altitude>0;
    $('#viewport').classList.toggle('evening',!up);
    scene.background.set(up?'#e6ebe4':'#526275');
    ground.material.color.set(up?'#e6ebe4':'#778a83');
    skyLight.intensity=up?1.45:.35;
    skyLight.color.set('#eaf1fa');
    sunLight.intensity=up?2.5:0;
    sunLight.color.set(solar.altitude<12?'#ffe2b6':'#fff8ed');
    sunLight.target.position.set(parameters.site_width/2000,1,-10);
    sunLight.position.copy(sunLight.target.position).addScaledVector(solar.direction,45);
    renderer.toneMappingExposure=.98;
    for(const light of gardenLights)light.visible=false;
    for(const material of gardenEmitters)material.emissiveIntensity=.1;
    document.querySelectorAll('[data-mood]').forEach(button=>button.setAttribute('aria-pressed','false'));
    $('#garden-design').checked=state.garden;
    $('#solar-samples').dataset.status='pending';
    timer=setTimeout(()=>sample(solar),150);
    render();
    return true;
  }

  $('#solar-enabled').addEventListener('change',event=>{
    state.solar=event.target.checked;
    if(state.solar){state.cut=false;state.roof=true;state.daylight=false;state.suite=false;state.view='whole';state.top=false;}
    refresh(true);
  });
  for(const id of ['solar-date','solar-hour','solar-neighbors']) $('#'+id).addEventListener('input',event=>{
    if(!event.target.checkValidity() || !event.target.value){duration.invalidate();return;}
    refresh(false);
  });
  $('#solar-window-group').addEventListener('change',()=>refresh(false));
  document.querySelectorAll('[data-season]').forEach(button=>button.addEventListener('click',()=>{
    const year=$('#solar-date').value.slice(0,4);
    $('#solar-date').value=`${year}-${button.dataset.season}`;
    refresh(false);
  }));
  for(const [id,key] of [['solar-latitude','latitude'],['solar-longitude','longitude'],['solar-north','north_rotation_deg']]) {
    $('#'+id).addEventListener('change',event=>{
      if(!event.target.checkValidity() || !event.target.value){duration.invalidate();return;}
      location[key]=Number(event.target.value); refresh(false);
    });
  }
  for(const key of ['north','south','east'])$('#neighbor-'+key).addEventListener('change',event=>{
    if(!event.target.checkValidity() || !event.target.value){duration.invalidate();return;}
    heights[key]=Number(event.target.value); rebuildNeighbors(); refresh(false);
  });
  return {applyLighting,sceneChanged(){sceneVersion++;applyLighting();},bounds:()=>neighbors.visible?new THREE.Box3().setFromObject(neighbors):null};
}
