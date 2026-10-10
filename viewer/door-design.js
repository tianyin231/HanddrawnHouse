import * as THREE from 'three';
import {interiorBuilder} from './interior-geometry.js';
import {interiorMaterials} from './interior-design.js';

import {doorLayout} from './door-layout.js';
export {doorLayout} from './door-layout.js';

export function createDoorDesign(p,plan) {
  const root=new THREE.Group();root.name=`DoorDesign_${plan.level}`;
  root.userData={door_root:true,model_component:true,model_status:'needs_review'};
  const materials=Object.fromEntries(Object.entries(interiorMaterials(plan.level,'a')).map(([k,v])=>[k,new THREE.MeshStandardMaterial(v)]));
  const g=interiorBuilder(root,materials);
  for(const door of doorLayout(p,plan)) {
    const [x,y,x1,y1]=door.bounds,horizontal=x1-x>y1-y;
    const {id,owner,label,amount}=door;
    const outer=door.opening==='main-hall-door'||door.opening.startsWith('annex-');
    const [px,py,pz]=door.pivot;
    g.context(door.room,'door');
    g.moving({id,owner,label,type:'hinge',amount,opening_id:door.opening,
      collision_bounds:[x-px,door.z+.032-pz,-y1+py,x1-px,door.z+.032+door.height-pz,-y+py]},door.pivot,()=>{
      g.box(outer?'metal':'wood',x,y,x1,y1,door.z+.032,door.height);
      if(outer)for(const side of [-1,1]) {
        const face=horizontal?(y+y1)/2+side*.026:(x+x1)/2+side*.026;
        if(horizontal)g.box('wood',x+.075,face-.004,x1-.075,face+.004,door.z+.14,door.height-.23);
        else g.box('wood',face-.004,y+.075,face+.004,y1-.075,door.z+.14,door.height-.23);
        for(const h of [.38,door.height-.35]) {
          if(horizontal)g.box('metal',x+.08,face-.005,x1-.08,face+.005,door.z+h,.008);
          else g.box('metal',face-.005,y+.08,face+.005,y1-.08,door.z+h,.008);
        }
      }
      const a=horizontal?(Math.abs(door.pivot[0]-x)<.01?x1-.085:x+.085):(x+x1)/2;
      const b=horizontal?(y+y1)/2:(Math.abs(door.pivot[1]-y)<.01?y1-.085:y+.085);
      for(const side of [-1,1])g.box('metal',a-.027+(horizontal?0:side*.039),b-.027+(horizontal?side*.039:0),a+.027+(horizontal?0:side*.039),b+.027+(horizontal?side*.039:0),door.z+.96,.045);
    });
  }
  g.finish();root.updateMatrixWorld(true);return root;
}
