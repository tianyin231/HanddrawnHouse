import * as THREE from 'three';
import {interiorBuilder} from './interior-geometry.js';
import {circulationLayout} from './circulation-layout.js';

export function createCirculationDesign(p,plan,options) {
  const layout=circulationLayout(p,plan),root=new THREE.Group();root.name=`CirculationLighting_${plan.level}`;
  root.userData={model_component:true,circulation_lighting:true,concept_only:true,model_status:'needs_review',layout};
  for(const item of layout.items) {
    const group=new THREE.Group();group.name=`CirculationFixture/${item.id}`;
    group.userData={model_component:true,circulation_fixture:item};
    const materials=Object.fromEntries(['white','metal','lamp'].map(key=>[key,new THREE.MeshStandardMaterial({name:`circulation/${key}`,...options[key]})]));
    const g=interiorBuilder(group,materials),[x,y,x1,y1]=item.bounds;
    g.context(item.space,'circulation-light');
    g.box(item.group==='porch'?'white':'metal',x,y,x1,y1,item.bottom,item.height,true);
    g.box('lamp',x+.018,y+.013,x1-.018,y1-.013,item.bottom-.004,.004);
    if(item.mount)g.pipe('metal',[item.mount,[(x+x1)/2,(y+y1)/2,item.bottom+.022]],.008);
    g.finish();root.add(group);
  }
  root.updateMatrixWorld(true);return root;
}
