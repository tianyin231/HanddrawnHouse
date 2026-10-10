import * as THREE from 'three';

// 玻璃透射也使用纹理采样器；保留材质余量，避免多灯夜景超过 WebGL 限额。
// 只分配阴影贴图，灯具亮度和分组状态不受影响。
export function createShadowBudget(scene,maxTextures) {
  const limit=Math.min(8,maxTextures-4),fixtures=[],eye=new THREE.Vector3();
  let activeKey='',selectionArea=null,chosen=new Set();
  scene.traverse(light=>{if(light.isLight&&light.castShadow){
    // 房屋与灯具平时静止；相机移动不改变它们之间的遮挡关系。
    light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;
    fixtures.push({light,position:new THREE.Vector3(),
      priority:light.isDirectionalLight?0:1,weight:/^(LightPreview|WindowSky)\//.test(light.name)?1:1.35});
  }});
  const visible=light=>{for(let o=light;o;o=o.parent)if(!o.visible)return false;return light.intensity>0;};
  return {limit,invalidate(){for(const {light} of fixtures)light.shadow.needsUpdate=true;},update(camera,area=null){
    const active=fixtures.filter(f=>visible(f.light));
    const key=active.map(f=>f.light.id).join(',');
    // 同一区域行走时不更换阴影灯，避免点光/聚光阴影数量变化触发同步着色器编译。
    if(area===null||area!==selectionArea||key!==activeKey){
      camera.getWorldPosition(eye);
      for(const fixture of active)fixture.light.getWorldPosition(fixture.position);
      const score=f=>f.position.distanceToSquared(eye)*f.weight*(f.light.castShadow?.8:1);
      active.sort((a,b)=>a.priority-b.priority||score(a)-score(b));
      if(area!==null&&key===activeKey&&chosen.size){
        // 换楼层/区域时可换成附近的灯，但保持各类阴影数量，复用已经编译的材质。
        const slots=new Map();for(const light of chosen)slots.set(light.type,(slots.get(light.type)||0)+1);
        chosen=new Set(active.filter(({light})=>{const n=slots.get(light.type)||0;if(!n)return false;slots.set(light.type,n-1);return true;}).map(f=>f.light));
      }else chosen=new Set(active.slice(0,limit).map(f=>f.light));
      activeKey=key;selectionArea=area;
    }
    for(const {light} of fixtures) {
      const enabled=chosen.has(light);
      if(enabled&&!light.shadow.map)light.shadow.needsUpdate=true;
      if(light.castShadow===enabled)continue;
      light.castShadow=enabled;light.shadow.needsUpdate=true;
      if(!enabled) {
        light.shadow.map?.dispose();light.shadow.map=null;
        light.shadow.mapPass?.dispose();light.shadow.mapPass=null;
      }
    }
    return chosen.size;
  }};
}
