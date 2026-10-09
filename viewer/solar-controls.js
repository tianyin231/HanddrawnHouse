import * as THREE from 'three';
import {solarPosition, createNeighbors, windowSamples, directSunSamples, NEIGHBOR_DEFAULTS} from './solar-study.js';

export function setupSolarControls({parameters, plans, state, scene, roots, skyLight, sunLight, renderer, ground, gardenLights, gardenEmitters, refresh, render}) {
  const $ = selector => document.querySelector(selector);
  let neighbors, timer;
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

  function sample(solar) {
    scene.updateMatrixWorld(true);
    const objects=[];
    for(const root of [...roots.values(), neighbors]) root.traverseVisible(obj=>{
      if(obj.isMesh && obj.castShadow && !obj.userData.glazing_proxy) objects.push(obj);
    });
    const result=directSunSamples(targets,solar,objects);
    $('#solar-samples').replaceChildren(...result.map(item=>{
      const row=document.createElement('div');
      const label=document.createElement('span'), value=document.createElement('strong');
      label.textContent=item.label; value.textContent=`${item.direct} / ${item.total}`;
      row.append(label,value); return row;
    }));
    $('#solar-samples').dataset.status='ready';
  }

  function applyLighting() {
    if(state.solar && (state.cut || !state.roof || !['whole','courtyard'].includes(state.view))) state.solar=false;
    $('#solar-enabled').checked=Boolean(state.solar);
    $('#solar-controls').hidden=!state.solar;
    $('#solar-badge').hidden=!state.solar;
    neighbors.visible=Boolean(state.solar && $('#solar-neighbors').checked);
    clearTimeout(timer);
    if(!state.solar) return false;
    const hour=Number($('#solar-hour').value);
    const solar=solarPosition($('#solar-date').value,hour,location);
    const time=`${String(Math.floor(hour)).padStart(2,'0')}:${String(Math.round(hour%1*60)).padStart(2,'0')}`;
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
    if(!event.target.checkValidity() || !event.target.value)return;
    refresh(false);
  });
  document.querySelectorAll('[data-season]').forEach(button=>button.addEventListener('click',()=>{
    const year=$('#solar-date').value.slice(0,4);
    $('#solar-date').value=`${year}-${button.dataset.season}`;
    refresh(false);
  }));
  for(const [id,key] of [['solar-latitude','latitude'],['solar-longitude','longitude'],['solar-north','north_rotation_deg']]) {
    $('#'+id).addEventListener('change',event=>{
      if(!event.target.checkValidity() || !event.target.value)return;
      location[key]=Number(event.target.value); refresh(false);
    });
  }
  for(const key of ['north','south','east'])$('#neighbor-'+key).addEventListener('change',event=>{
    if(!event.target.checkValidity() || !event.target.value)return;
    heights[key]=Number(event.target.value); rebuildNeighbors(); refresh(false);
  });
  return {applyLighting, bounds:()=>neighbors.visible?new THREE.Box3().setFromObject(neighbors):null};
}
