import * as THREE from 'three';
import {solarPosition,windowSamples} from './solar-study.js';
import {connectedLightingRooms} from './lighting-layout.js';

// 普通浏览使用邯郸秋分示意时刻；日照分析仍读取用户选择的日期、时间和北向。
export const LIGHT_PROFILES={
  day:{hour:10.5,sun:3.4,sky:.42,environment:.65,exposure:1.06,color:'#fff5e8',zenith:'#adc8e4',horizon:'#f2f1e9',ground:'#a9a89f',background:'#dce5ec'},
  evening:{hour:17.5,sun:1.35,sky:.22,environment:.35,exposure:1.12,color:'#ffd2a1',zenith:'#8296b3',horizon:'#edc9a7',ground:'#7e7c77',background:'#8795a6'},
  night:{hour:21,sun:0,sky:.10,environment:.18,exposure:1.12,color:'#d6e1f5',zenith:'#344965',horizon:'#8191a3',ground:'#77766e',background:'#111d2c'}
};

export function daylightPortals(parameters,plans) {
  return windowSamples(parameters,plans).map(sample=>{
    const plan=plans.find(p=>p.level===sample.level),opening=plan.openings.find(o=>o.id===sample.opening_id);
    const room=plan.spaces.find(r=>r.id===sample.space),[x,y,x1,y1]=room.clear_bounds_mm;
    const position=sample.points[4].clone().addScaledVector(sample.normal,-.18);
    const target=new THREE.Vector3((x+x1)/2000,(sample.level-1)*parameters.floor_to_floor/1000+.8,-(y+y1)/2000);
    return {id:sample.id,roomKey:`${sample.level}:${sample.space}`,position,target,skyPoint:sample.points[4],normal:sample.normal,
      intensity:Math.min(18,opening.width*(opening.head-opening.sill)/1e6*4),distance:Math.max(5,position.distanceTo(target)+3)};
  });
}

export function setupSceneLighting({scene,renderer,skyLight,sunLight,ground,parameters,plans}) {
  const generator=new THREE.PMREMGenerator(renderer),environments=new Map(),portals=[];
  const blockers=[],ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);
  scene.updateMatrixWorld(true);
  scene.traverseVisible(object=>{
    if(!object.isMesh||!object.castShadow||object.userData.comparison_only)return;
    for(let o=object;o;o=o.parent)if(o.userData.scenario_only)return;
    blockers.push(object);
  });
  let profileName='day',portalSettings='',shadowSettings='';
  const shadowFocus=new THREE.Vector3(Infinity,Infinity,Infinity);
  for(const data of daylightPortals(parameters,plans)){
    // 从窗外采样可见天空，屋檐、楼梯和实体墙会降低漫射补光。
    const side=data.normal.clone().cross(up),origin=data.skyPoint.clone().addScaledVector(data.normal,.04);
    let visibleSky=0;
    for(const [rise,lateral] of [[.35,0],[1,0],[2.5,0],[.85,-.8],[.85,.8]]){
      const direction=data.normal.clone().addScaledVector(up,rise).addScaledVector(side,lateral).normalize();
      ray.set(origin,direction);ray.near=.01;ray.far=35;
      if(!ray.intersectObjects(blockers,false).length)visibleSky++;
    }
    data.skyVisibility=visibleSky/5;data.intensity*=.12+.88*data.skyVisibility;
    const light=new THREE.SpotLight('#eef4ff',data.intensity,data.distance,Math.PI*.42,1,2);
    light.name=`WindowSky/${data.id}`;light.position.copy(data.position);light.target.position.copy(data.target);
    light.castShadow=true;light.visible=false;light.shadow.mapSize.set(512,512);
    light.shadow.camera.near=.04;light.shadow.bias=-.0007;light.shadow.normalBias=.018;light.shadow.radius=2;
    scene.add(light,light.target);portals.push({light,data});
  }
  function environment(name){
    if(environments.has(name))return environments.get(name).texture;
    const p=LIGHT_PROFILES[name],width=128,height=64,data=new Float32Array(width*height*4);
    const top=new THREE.Color(p.zenith),horizon=new THREE.Color(p.horizon),bottom=new THREE.Color(p.ground),color=new THREE.Color();
    for(let y=0;y<height;y++){
      const altitude=-Math.cos(y/(height-1)*Math.PI);
      color.copy(horizon).lerp(altitude>0?top:bottom,Math.pow(Math.abs(altitude),.6));
      for(let x=0;x<width;x++){const i=(y*width+x)*4;color.toArray(data,i);data[i+3]=1;}
    }
    const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
    texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;
    const result=generator.fromEquirectangular(texture);texture.dispose();environments.set(name,result);return result.texture;
  }
  function apply(name,study=false){
    shadowSettings='';
    profileName=name;const p=LIGHT_PROFILES[name];
    scene.environment=environment(name);scene.environmentIntensity=study?.25:p.environment;
    if(study)return;
    scene.background.set(p.background);ground.material.color.set('#d5d6d0');
    skyLight.color.set(name==='night'?'#eee5d6':'#e5edfa');skyLight.groundColor.set('#d5cec2');skyLight.intensity=p.sky;
    sunLight.color.set(p.color);sunLight.intensity=p.sun;
    const solar=solarPosition('2026-09-23',p.hour,parameters.solar_location);
    sunLight.target.position.set(parameters.site_width/2000,1,-10);
    sunLight.position.copy(sunLight.target.position).addScaledVector(solar.direction,45);
    renderer.toneMappingExposure=p.exposure;
  }
  return {apply,
    update(camera,{roomKey='',close=false,walking=false,solar=false,cut=false}){
      const settings=[roomKey,close,solar,cut,profileName].join('|');
      if(settings!==portalSettings){
        portalSettings=settings;
        const activeRooms=connectedLightingRooms(plans,roomKey),night=profileName==='night';
        // 同一敞开区域保持同一组窗光，避免走过房间边界时忽明忽暗。
        const active=close&&!solar&&!cut&&!night?portals.filter(p=>activeRooms.has(p.data.roomKey))
          .sort((a,b)=>b.data.intensity-a.data.intensity).slice(0,3):[];
        for(const portal of portals){
          const enabled=active.includes(portal);portal.light.visible=enabled;
          portal.light.intensity=portal.data.intensity*(profileName==='evening'?.28:1);
          if(!enabled&&portal.light.shadow.map){portal.light.shadow.map.dispose();portal.light.shadow.map=null;}
        }
      }
      const nextShadowSettings=[close,walking,solar,sunLight.shadow.mapSize.x,profileName].join('|');
      // 漫游的太阳阴影一次覆盖小院，不再每走两米重绘；室内查看仍保留局部范围。
      if(!solar&&shadowSettings===nextShadowSettings&&(walking||!close||shadowFocus.distanceToSquared(camera.position)<4))return;
      shadowSettings=nextShadowSettings;shadowFocus.copy(camera.position);
      const direction=sunLight.position.clone().sub(sunLight.target.position).normalize();
      const extent=walking?16:close&&!solar?9:24,shadow=sunLight.shadow;
      if(!solar){
        if(close&&!walking)sunLight.target.position.copy(camera.position);
        else sunLight.target.position.set(parameters.site_width/2000,1,-10);
        const right=direction.clone().cross(up).normalize(),vertical=right.clone().cross(direction).normalize(),step=2*extent/shadow.mapSize.x;
        for(const axis of [right,vertical]){
          const offset=sunLight.target.position.dot(axis);
          sunLight.target.position.addScaledVector(axis,Math.round(offset/step)*step-offset);
        }
        sunLight.position.copy(sunLight.target.position).addScaledVector(direction,45);
      }
      Object.assign(shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:95});
      shadow.camera.updateProjectionMatrix();shadow.bias=-.00018;
      shadow.normalBias=Math.max(.012,2*extent/shadow.mapSize.x*1.25);shadow.radius=2;
      shadow.needsUpdate=true;
    }
  };
}
