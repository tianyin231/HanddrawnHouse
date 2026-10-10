import * as THREE from 'three';
import {EYE_HEIGHT,touchesBody} from './walk-world.js';

export function createWalkControls({canvas,camera,world,dynamic,interact,changed,exit}) {
  const keys=new Set(),pad=document.querySelector('#walk-pad'),status=document.querySelector('#walk-status');
  let active=false,position={x:6.4,y:3.7,z:0},yaw=0,pitch=0,drag=null;
  const controller={
    get active(){return active;},get position(){return active?position:null;},
    start(view){
      active=true;keys.clear();pitch=0;
      if(view){position={x:view.eye[0],y:-view.eye[2],z:view.eye[1]-1.55};yaw=Math.atan2(view.target[0]-view.eye[0],view.eye[2]-view.target[2]);}
      else {position={x:6.4,y:3.7,z:world.surface(6.4,3.7,-.45)};yaw=0;}
      // 室内预设眼高略有不同，统一落到同一完成面。
      position.z=world.surface(position.x,position.y,position.z)??position.z;
      const blockers=world.obstacles.concat(dynamic());
      if(blockers.some(o=>touchesBody(o,position.x,position.y,position.z))) {
        const candidates=[];
        for(let r=.12;r<=.72;r+=.12)for(let i=0;i<8;i++)candidates.push({...position,x:position.x+r*Math.cos(i*Math.PI/4),y:position.y+r*Math.sin(i*Math.PI/4)});
        const free=candidates.find(v=>world.surface(v.x,v.y,v.z)!==null&&!blockers.some(o=>touchesBody(o,v.x,v.y,v.z)));
        if(free)position=free;
      }
      pad.hidden=false;canvas.focus();updateCamera();
    },
    stop(){active=false;keys.clear();drag=null;pad.hidden=true;},
    tick(dt){
      if(!active)return false;
      if(!keys.size)return false;
      let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      let right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      if(keys.has('KeyQ'))yaw-=dt*1.5;if(keys.has('KeyE'))yaw+=dt*1.5;
      const length=Math.hypot(forward,right)||1,speed=1.45*dt/length;
      if(forward||right)position=world.move(position,(Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed,(Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed,dynamic());
      updateCamera();return keys.size>0;
    }
  };
  function updateCamera(){
    camera.position.set(position.x,position.z+EYE_HEIGHT,-position.y);camera.rotation.set(pitch,-yaw,0,'YXZ');
    camera.updateMatrixWorld(true);
    status.textContent=`眼高 1.65 米 · 脚下标高 ${position.z.toFixed(2)} 米`;
    status.dataset.x=position.x.toFixed(3);status.dataset.y=position.y.toFixed(3);status.dataset.z=position.z.toFixed(3);
    changed(position);
  }
  const editing=target=>target.closest('input,select,textarea,[contenteditable=true],dialog');
  document.addEventListener('keydown',event=>{
    if(!active||editing(event.target)||document.querySelector('dialog[open]'))return;
    if(event.code==='Escape'){exit();return;}
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)interact();return;}
    if(/^(Key[WASDQE]|Arrow(Up|Down|Left|Right))$/.test(event.code)){event.preventDefault();keys.add(event.code);}
  });
  document.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{keys.clear();drag=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();drag=null;}});
  document.addEventListener('focusin',event=>{if(editing(event.target))keys.clear();});
  canvas.addEventListener('pointerdown',event=>{if(active&&event.button===0){canvas.setPointerCapture(event.pointerId);drag={id:event.pointerId,x:event.clientX,y:event.clientY};}});
  canvas.addEventListener('pointermove',event=>{
    if(!active||drag?.id!==event.pointerId)return;
    yaw-=(event.clientX-drag.x)*.004;pitch=THREE.MathUtils.clamp(pitch-(event.clientY-drag.y)*.004,-1.15,1.15);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};updateCamera();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;});
  for(const button of document.querySelectorAll('[data-walk-key]')) {
    const release=()=>keys.delete(button.dataset.walkKey);
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.walkKey);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  }
  document.querySelector('#walk-interact').addEventListener('click',()=>interact());
  document.querySelector('#walk-exit').addEventListener('click',exit);
  return controller;
}
