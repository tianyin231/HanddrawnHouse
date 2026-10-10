import * as THREE from 'three';
import {circulationLayout} from './circulation-layout.js';
import {createCirculationDesign} from './circulation-design.js';
import {interiorMaterials} from './interior-design.js';

export function setupCirculationLighting({parameters,plans,roots,gardenLights,gardenEmitters,state,gardenDesign,changed}) {
  const $=id=>document.getElementById(id),models=[],emitters=[];
  const visible=object=>{for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;};
  for(const plan of plans) {
    const floor=roots.get(plan.level);
    let model=floor.children.find(child=>child.userData.circulation_lighting);
    if(!model){model=createCirculationDesign(parameters,plan,interiorMaterials(plan.level,'a'));floor.add(model);}
    models.push(model);
    for(const item of circulationLayout(parameters,plan).items) {
      const light=new THREE.SpotLight('#ffe1b5',item.previewIntensity,5,Math.PI*.36,.8,2);
      light.position.set(item.position[0],item.position[2],-item.position[1]);light.target.position.set(item.target[0],item.target[2],-item.target[1]);
      light.userData.lighting_group=item.group;light.name=`CirculationPreview/${item.id}`;
      light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.camera.near=.05;light.shadow.camera.far=6;
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.bias=-.0007;light.shadow.normalBias=.024;light.shadow.radius=2;light.visible=false;
      model.add(light,light.target);gardenLights.push(light);
    }
    floor.traverse(object=>{
      if(!object.isMesh)return;
      let group;
      if(object.userData.garden_material==='lamp')group='garden';
      else if(object.material.name.startsWith('exterior/porch-light'))group='porch';
      else if(object.userData.interior_kind==='circulation-light'&&object.userData.interior_material==='lamp') {
        const metadata=object.parent.userData.circulation_fixture;
        group=(typeof metadata==='string'?JSON.parse(metadata):metadata).group;
        gardenEmitters.push(object.material);
      }
      if(group){object.castShadow=false;emitters.push({object,group});}
    });
  }
  const fixtures=gardenLights.map(light=>({light,group:light.userData.lighting_group,base:light.intensity}));
  function update(enabled,solar=false) {
    const dim=Number($('outdoor-dim').value)/100,counts={garden:0,porch:0,path:0};
    for(const model of models)model.visible=!state.cut&&!state.daylight;
    const on=group=>enabled&&!solar&&!state.cut&&!state.daylight&&$('outdoor-'+group).checked&&dim>0&&(group!=='garden'||gardenDesign.visible);
    for(const {light,group,base} of fixtures) {
      light.visible=on(group)&&visible(light.parent);light.intensity=base*dim;
      if(light.visible)counts[group]++;
      else if(light.shadow?.map){light.shadow.map.dispose();light.shadow.map=null;}
    }
    for(const {object,group} of emitters)object.material.emissiveIntensity=on(group)&&visible(object)?2.2*dim:0;
    $('outdoor-dim-value').textContent=`${Math.round(dim*100)}%`;
    $('outdoor-light-note').textContent=solar?'日照模式已关闭人工灯。':enabled?`当前亮灯：庭院 ${counts.garden} · 门廊 ${counts.porch} · 台阶楼梯 ${counts.path}。`:'选择傍晚或夜间通行查看灯光；灯具数量与配光均为方案。';
    $('outdoor-light-note').dataset.activeCount=Object.values(counts).reduce((sum,n)=>sum+n,0);
  }
  function setQuality(mode,compact) {
    const size=mode==='smooth'||(compact&&mode!=='clear')?256:512;
    for(const {light} of fixtures)if(light.shadow.mapSize.x!==size) {
      light.shadow.map?.dispose();light.shadow.map=null;light.shadow.mapSize.set(size,size);light.shadow.needsUpdate=true;
    }
  }
  for(const id of ['outdoor-garden','outdoor-porch','outdoor-path','outdoor-dim'])$(id).addEventListener('input',changed);
  return {update,setQuality};
}
