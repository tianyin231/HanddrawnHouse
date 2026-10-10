import * as THREE from 'three';
import {overlap,touchesBody} from './walk-world.js';

export function collectMotions(roots) {
  const result=[];
  for(const [level,root] of roots)root.traverse(node=>{
    if(!node.userData.motion)return;
    const source=typeof node.userData.motion==='string'?JSON.parse(node.userData.motion):node.userData.motion;
    const data={...source,id:`${level}:${source.id}`};
    const bounds=new THREE.Box3();
    node.traverse(child=>{if(child.isMesh&&child.userData.interior_material!=='metal'){child.geometry.computeBoundingBox();bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrix));}});
    if(data.collision_bounds){bounds.min.fromArray(data.collision_bounds);bounds.max.fromArray(data.collision_bounds,3);}
    result.push({node,data,bounds,level,value:0,target:0,base:node.position.clone(),rotation:node.quaternion.clone()});
  });
  return result;
}

export function poseMotion(motion,value) {
  const {node,data,base,rotation}=motion;
  node.position.copy(base);node.quaternion.copy(rotation);
  if(data.type==='hinge')node.rotateY(data.amount*value);
  else node.position.addScaledVector(new THREE.Vector3(...data.direction),data.amount*value);
  motion.value=value;node.updateMatrixWorld(true);
}

export function motionObstacle(m) {
  m.node.updateWorldMatrix(true,false);
  const matrix=m.node.matrixWorld;
  if(m.obstacleMatrix?.equals(matrix))return m.obstacle;
  (m.obstacleMatrix??=new THREE.Matrix4()).copy(matrix);
  const b=m.bounds,points=[[b.min.x,b.min.z],[b.max.x,b.min.z],[b.max.x,b.max.z],[b.min.x,b.max.z]].map(([x,z])=>new THREE.Vector3(x,0,z).applyMatrix4(matrix));
  const bottom=new THREE.Vector3(0,b.min.y,0).applyMatrix4(matrix).y,top=new THREE.Vector3(0,b.max.y,0).applyMatrix4(matrix).y;
  return m.obstacle={polygon:points.map(p=>[p.x,-p.z]),bottom,top,owner:`${m.level}:${m.data.owner}`,label:m.data.label};
}

export function createMotionControls({motions,world,body,changed}) {
  const select=document.querySelector('#motion-select'),button=document.querySelector('#motion-toggle'),note=document.querySelector('#motion-note');
  let selected=null;
  for(const m of motions)select.append(new Option(`${m.level}层 · ${m.data.label}`,m.data.id));
  function choose(m) {
    selected=m;select.value=m?.data.id||'';button.disabled=!m;
    button.textContent=m?.target?'关闭构件':'打开构件';
  }
  function toggle(m=selected) {
    if(!m)return;choose(m);m.target=m.value>.02?0:1;button.textContent=m.target?'关闭构件':'打开构件';
    note.textContent='正在检查开启空间…';changed();
  }
  select.addEventListener('change',()=>choose(motions.find(m=>m.data.id===select.value)));
  button.addEventListener('click',()=>toggle());
  const meshes=[];for(const m of motions)m.node.traverse(o=>{if(o.isMesh){o.userData.motionId=m.data.id;meshes.push(o);}});
  return {
    motions,meshes,choose,toggle,
    selectRoom(level,room){for(const option of select.options)if(option.value){const m=motions.find(m=>m.data.id===option.value);option.hidden=!!room&&(m.level!==level||m.node.userData.interior_room!==room);}
      choose(motions.find(m=>m.level===level&&m.node.userData.interior_room===room)||null);},
    obstacles:()=>motions.map(motionObstacle),
    tick(dt){
      let moving=false;
      for(const m of motions) {
        if(Math.abs(m.value-m.target)<.001)continue;
        moving=true;
        const previous=m.value,next=previous+Math.sign(m.target-previous)*Math.min(Math.abs(m.target-previous),dt*1.6);
        poseMotion(m,next);
        const candidate=motionObstacle(m),person=body();
        const obstacle=world.obstacles.find(o=>o.owner!==candidate.owner&&overlap(candidate,o))||motions.find(other=>other!==m&&overlap(candidate,motionObstacle(other)));
        if(obstacle||(person&&touchesBody(candidate,person.x,person.y,person.z))) {
          poseMotion(m,previous);m.target=previous;
          note.textContent=`${m.data.label}前有${obstacle?'墙体或家具':'人'}，已停在碰撞前。请留出空间后再操作。`;
          if(selected===m)button.textContent=previous>.02?'关闭构件':'打开构件';
        } else if(Math.abs(next-m.target)<.001)note.textContent=`${m.data.label}已${m.target?'打开':'关闭'}。开合方向与五金仍为方案值。`;
      }
      return moving;
    }
  };
}
