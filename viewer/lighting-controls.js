import * as THREE from 'three';
import {lightingLayout,LIGHTING_SCENES,connectedLightingRooms} from './lighting-layout.js';

export function setupInteriorLighting({roots,layouts,interiors,plans,changed}) {
  const $=id=>document.getElementById(id),fixtures=[],emitters=[];
  let roomKey='',solar=false,settings='',transition=1;
  const releaseShadow=light=>{light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapPass?.dispose();light.shadow.mapPass=null;};
  for(const [level,layout] of layouts) {
    for(const data of lightingLayout(layout)) {
      const light=data.group==='ceiling'||data.target?new THREE.SpotLight(data.color,0,data.target?3.4:7,Math.PI*(data.target ? .38 : .43),1,2):new THREE.PointLight(data.color,0,4.5,2);
      light.name=`LightPreview/${data.id}`;light.position.set(data.position[0],data.position[2],-data.position[1]);
      if(light.isSpotLight){const target=data.target||[data.position[0],data.position[1],.1];light.target.position.set(target[0],target[2],-target[1]);roots.get(level).add(light.target);}
      light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-.0007;light.shadow.normalBias=.024;light.shadow.radius=2;
      light.shadow.camera.near=.10;light.shadow.camera.far=10;light.shadow.camera.updateProjectionMatrix();
      light.visible=false;roots.get(level).add(light);fixtures.push({light,data,roomKey:`${level}:${data.space}`,target:0});
    }
    interiors.get(level).traverse(object=>{
      const {interior_material:material,interior_room:room,interior_kind:kind}=object.userData;
      if(!object.isMesh||!['lamp','shade'].includes(material))return;
      // 灯罩以散射发光面表达，防止封闭示意灯罩把内部点光源完全挡住。
      object.castShadow=false;
      object.material.emissiveIntensity=0;
      emitters.push({object,roomKey:`${level}:${room}`,group:kind==='ceiling'?'ceiling':'local',base:material==='lamp'?1.2:.3,target:0});
    });
  }
  function update(nextRoom=roomKey,inSolar=solar) {
    roomKey=nextRoom;solar=inSolar;
    const key=[roomKey,solar,...['lighting-scene','lighting-dim'].map(id=>$(id).value),$('lighting-ceiling').checked,$('lighting-local').checked].join('|');
    if(key===settings)return;settings=key;transition=solar?1:0;
    const scene=LIGHTING_SCENES[$('lighting-scene').value],dim=Number($('lighting-dim').value)/100;
    const levels={ceiling:$('lighting-ceiling').checked?scene.ceiling*dim:0,local:$('lighting-local').checked?scene.local*dim:0};
    const connected=connectedLightingRooms(plans,roomKey);
    let on=0;
    for(const fixture of fixtures) {
      const active=!solar&&connected.has(fixture.roomKey)&&levels[fixture.data.group]>0;
      fixture.from=fixture.light.intensity;
      fixture.target=active?fixture.data.previewIntensity*levels[fixture.data.group]:0;if(active)on++;
      // 日照试算必须立即熄灯；普通跨房间切换由 tick 平滑过渡。
      if(solar){fixture.light.intensity=0;fixture.light.visible=false;releaseShadow(fixture.light);}
    }
    for(const emitter of emitters){emitter.from=emitter.object.material.emissiveIntensity;emitter.target=!solar&&connected.has(emitter.roomKey)?emitter.base*levels[emitter.group]:0;if(solar)emitter.object.material.emissiveIntensity=0;}
    const inRoom=fixtures.filter(f=>f.roomKey===roomKey),[level,id]=roomKey.split(':');
    const room=layouts.get(Number(level))?.rooms.find(r=>r.id===id);
    $('lighting-room-note').textContent=room?`${level}层${room.label} · ${inRoom.map(f=>f.data.name).join('、')||'尚未布灯'} · 连通区域亮 ${on} 盏`:'选择室内房间查看灯光；敞口相连的厅、餐厅和厨房一起亮灯。';
    $('lighting-dim-value').textContent=`${Math.round(dim*100)}%`;
    $('lighting-room-note').dataset.activeCount=on;
    const day=!scene.night;for(const id of ['lighting-ceiling','lighting-local','lighting-dim'])$(id).disabled=day;
  }
  function tick(dt){
    if(transition>=1)return false;
    transition=Math.min(1,transition+dt/.4);
    const rate=THREE.MathUtils.smoothstep(transition,0,1);
    for(const fixture of fixtures){
      const light=fixture.light;
      light.intensity=THREE.MathUtils.lerp(fixture.from,fixture.target,rate);
      // 同组在过渡结束时一次性停用，避免依次熄灯反复编译不同数量的光源。
      light.visible=fixture.target>0||(transition<1&&fixture.from>0);
      if(!light.visible&&light.shadow.map)releaseShadow(light);
    }
    for(const emitter of emitters){
      emitter.object.material.emissiveIntensity=THREE.MathUtils.lerp(emitter.from,emitter.target,rate);
    }
    return true;
  }
  function setQuality(mode,compact) {
    for(const {light} of fixtures) {
      const size=light.isSpotLight&&mode!=='smooth'&&(!compact||mode==='clear')?1024:512;
      if(light.shadow.mapSize.x===size)continue;
      releaseShadow(light);light.shadow.mapSize.set(size,size);light.shadow.needsUpdate=true;
    }
  }
  for(const id of ['lighting-scene','lighting-ceiling','lighting-local','lighting-dim'])$(id).addEventListener('input',()=>{update();changed();});
  return {update,tick,setQuality,isNight:()=>LIGHTING_SCENES[$('lighting-scene').value].night};
}
