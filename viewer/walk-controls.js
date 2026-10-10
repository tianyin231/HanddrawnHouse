import * as THREE from 'three';
import {EYE_HEIGHT,touchesBody} from './walk-world.js';

export function createWalkControls({canvas,camera,world,dynamic,interact,changed,exit,cycleLighting}) {
  const keys=new Set(),pad=document.querySelector('#walk-pad'),status=document.querySelector('#walk-status');
  const lookHint=document.querySelector('#walk-look-hint');
  let active=false,position={x:6.4,y:3.7,z:0},eyeY=EYE_HEIGHT,yaw=0,pitch=0,drag=null,locked=false,captureFailed=false;
  const mouseLookAvailable=()=>Boolean(!captureFailed&&canvas.requestPointerLock&&matchMedia('(pointer: fine)').matches);
  function updateLookHint(){
    lookHint.textContent=locked?'鼠标环顾 · WASD 移动 · Shift 快走 · 空格开门 · L 光照 · Esc 退出':
      mouseLookAvailable()?'点击画面开启鼠标环顾，也可拖动环看 · WASD 移动 · Esc 退出':
      matchMedia('(pointer: fine)').matches?'拖动环看 · WASD 移动 · 空格开门 · Esc 退出':'拖动画面环看 · 按住方向键移动';
  }
  function useDragLook(){captureFailed=true;updateLookHint();}
  function captureMouse(){
    if(!active||!mouseLookAvailable()||document.pointerLockElement===canvas)return;
    // 内嵌浏览器可能不允许锁定鼠标，仍保留拖动与键盘操作。
    try{canvas.requestPointerLock()?.catch(useDragLook);}catch{useDragLook();}
  }
  function look(dx,dy){
    yaw+=dx*.004;pitch=THREE.MathUtils.clamp(pitch-dy*.004,-1.15,1.15);updateCamera();
  }
  const controller={
    get active(){return active;},get position(){return active?position:null;},
    start(view,capture=false){
      active=true;keys.clear();pitch=0;captureFailed=false;
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
      eyeY=position.z+EYE_HEIGHT;
      pad.hidden=false;canvas.focus();updateLookHint();updateCamera();
      if(capture)captureMouse();
    },
    stop(){
      active=false;keys.clear();drag=null;pad.hidden=true;
      if(document.pointerLockElement===canvas)document.exitPointerLock();
      locked=false;
    },
    tick(dt){
      if(!active)return false;
      if(!keys.size&&Math.abs(eyeY-position.z-EYE_HEIGHT)<.0005)return false;
      let forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      let right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      if(keys.has('KeyQ'))yaw-=dt*1.5;if(keys.has('KeyE'))yaw+=dt*1.5;
      const length=Math.hypot(forward,right)||1,speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?3.6:2.2)*dt/length;
      if(forward||right)position=world.move(position,(Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed,(Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed,dynamic());
      // 脚下仍按实体台阶碰撞，眼高连续追随；松开按键后也完成最后一小段过渡。
      eyeY=THREE.MathUtils.damp(eyeY,position.z+EYE_HEIGHT,12,dt);
      updateCamera();return true;
    }
  };
  function updateCamera(){
    camera.position.set(position.x,eyeY,-position.y);camera.rotation.set(pitch,-yaw,0,'YXZ');
    camera.updateMatrixWorld(true);
    const text=`眼高 1.65 米 · 脚下标高 ${position.z.toFixed(2)} 米`;
    if(status.textContent!==text)status.textContent=text;
    status.dataset.x=position.x.toFixed(3);status.dataset.y=position.y.toFixed(3);status.dataset.z=position.z.toFixed(3);
    changed(position);
  }
  const editing=target=>target.closest('input,select,textarea,[contenteditable=true],dialog');
  document.addEventListener('keydown',event=>{
    if(!active||editing(event.target)||document.querySelector('dialog[open]'))return;
    if(event.code==='Escape'){exit();return;}
    if(event.code==='KeyL'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(!event.repeat)cycleLighting();return;}
    if(event.code==='Space'){event.preventDefault();if(!event.repeat)interact();return;}
    if(/^(Key[WASDQE]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(event.code)){event.preventDefault();keys.add(event.code);}
  });
  document.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{keys.clear();drag=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();drag=null;}});
  document.addEventListener('focusin',event=>{if(editing(event.target))keys.clear();});
  document.addEventListener('pointerlockchange',()=>{
    const wasLocked=locked;locked=document.pointerLockElement===canvas;drag=null;keys.clear();updateLookHint();
    // 浏览器会先处理 Esc 并释放鼠标，未必再向页面发送按键事件。
    if(active&&wasLocked&&!locked)exit();
  });
  document.addEventListener('pointerlockerror',useDragLook);
  document.addEventListener('mousemove',event=>{if(active&&locked)look(event.movementX,event.movementY);});
  canvas.addEventListener('pointerdown',event=>{
    if(!active||event.button!==0)return;
    if(locked){interact();return;}
    canvas.setPointerCapture(event.pointerId);drag={id:event.pointerId,x:event.clientX,y:event.clientY};
    if(event.pointerType==='mouse')captureMouse();
  });
  canvas.addEventListener('pointermove',event=>{
    if(!active||locked||drag?.id!==event.pointerId)return;
    look(event.clientX-drag.x,event.clientY-drag.y);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};
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
