import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {interiorLayout} from '../viewer/interior-layout.js';
import {lightingLayout} from '../viewer/lighting-layout.js';
import {circulationLayout} from '../viewer/circulation-layout.js';
import {createShadowBudget} from '../viewer/lighting-shadows.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const p=read('house_parameters.json'),plans=[read('plan_floor_1.json'),read('plan_floor_2.json')];

test('相机移动复用灯具阴影，构件改变和贴图重建时才更新',()=>{
  const scene=new THREE.Scene(),light=new THREE.SpotLight('#fff',10),camera=new THREE.PerspectiveCamera();
  light.castShadow=true;scene.add(light);
  const budget=createShadowBudget(scene,16);budget.update(camera);
  assert.equal(light.shadow.autoUpdate,false);
  light.shadow.map={dispose(){}};light.shadow.needsUpdate=false;
  camera.position.x=1;budget.update(camera);
  assert.equal(light.shadow.needsUpdate,false,'只是移动相机不需要重绘静止灯的阴影');
  budget.invalidate();assert.equal(light.shadow.needsUpdate,true,'开门或切换楼层后阴影必须刷新');
  light.shadow.needsUpdate=false;light.shadow.map=null;budget.update(camera);
  assert.equal(light.shadow.needsUpdate,true,'切换画质释放贴图后需要重建');
});

test('漫游不按每帧距离切换阴影类型，换区域后保持着色器所需数量',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),lights=[];
  for(let i=0;i<6;i++)for(const Type of [THREE.PointLight,THREE.SpotLight]){
    const light=new Type('#fff',10);light.castShadow=true;light.position.x=i*4+(light.isSpotLight?8:0);
    scene.add(light);lights.push(light);
  }
  const budget=createShadowBudget(scene,12),selected=()=>lights.filter(l=>l.castShadow);
  const counts=()=>['PointLight','SpotLight'].map(type=>selected().filter(l=>l.type===type).length);
  budget.update(camera,'yard');const start=selected(),types=counts();
  camera.position.x=30;budget.update(camera,'yard');
  assert.deepEqual(selected(),start,'同一区域不能因跨过灯距中线重新编译材质');
  budget.update(camera,'upper-porch');assert.deepEqual(counts(),types);
  assert.notDeepEqual(selected(),start,'切换区域仍能选取附近的同类光源');
  lights.forEach(l=>l.visible=false);budget.update(camera,'upper-porch');
  assert.equal(selected().length,0,'关灯后必须释放阴影占用');
});

test('两层公共灯与厨房任务灯同时亮起时，阴影不占满玻璃所需采样器，切换可释放并恢复',()=>{
  const scene=new THREE.Scene(),roots=[],lights=[],indoor=[];
  const sun=new THREE.DirectionalLight('#fff',0);sun.castShadow=true;scene.add(sun);lights.push(sun);
  for(const plan of plans) {
    const root=new THREE.Group();root.position.y=(plan.level-1)*3.2;scene.add(root);roots.push(root);
    for(const data of circulationLayout(p,plan).items) {
      const light=new THREE.SpotLight('#fff',data.previewIntensity);light.castShadow=true;
      light.position.set(data.position[0],data.position[2],-data.position[1]);root.add(light);lights.push(light);
    }
  }
  for(const data of lightingLayout(interiorLayout(p,plans[0])).filter(l=>l.space==='kitchen')) {
    const light=new THREE.SpotLight('#fff',data.previewIntensity);light.name=`LightPreview/${data.id}`;light.castShadow=true;
    roots[0].add(light);lights.push(light);indoor.push(light);
  }
  assert.equal(indoor.length,4);assert.ok(lights.filter(l=>l.castShadow).length>16);
  const originals=lights.map(l=>[l.intensity,l.visible]),camera=new THREE.PerspectiveCamera(),budget=createShadowBudget(scene,16);
  budget.update(camera);
  assert.ok(lights.filter(l=>l.castShadow).length<=12,'必须为玻璃材质留下纹理采样器');
  assert.ok(indoor.every(l=>l.castShadow),'当前房间的遮挡关系优先保留');
  assert.deepEqual(lights.map(l=>[l.intensity,l.visible]),originals,'不应为了阴影预算熄灯或改变亮度');
  let disposed=0;indoor[0].shadow.map={dispose(){disposed++;}};
  roots[0].visible=false;sun.intensity=2;budget.update(camera);
  assert.equal(disposed,1);assert.equal(indoor[0].shadow.map,null);assert.equal(sun.castShadow,true);
  assert.ok(indoor.every(l=>!l.castShadow),'隐藏楼层不占阴影资源');
  roots[0].visible=true;budget.update(camera);assert.ok(indoor.every(l=>l.castShadow));
});
