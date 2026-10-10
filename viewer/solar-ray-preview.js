import * as THREE from 'three';
import {minuteLabel} from './solar-duration.js';
import {sunBlockerInfo} from './solar-obstructions.js';

// 诊断覆盖层独立于模型，只展示一条窗中心到最近障碍的路径，不改变构件可见性或计算条件。
export function setupSolarRayPreview({scene,objects,render}) {
  const group=new THREE.Group();group.name='SolarRayPreview';scene.add(group);
  const note=document.getElementById('solar-ray-note'),text=note.querySelector('span');
  function clear(){
    for(const object of [...group.children]){group.remove(object);if(!object.userData.sharedGeometry)object.geometry.dispose();object.material.dispose();}
    note.hidden=true;render();
  }
  note.querySelector('button').addEventListener('click',clear);
  function show(window,bin) {
    clear();const hit=bin.center_diagnostic.hit;if(!hit)return;
    const start=new THREE.Vector3(...window.points_m[Math.floor(window.points_m.length/2)]),end=new THREE.Vector3(...hit.point_m);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([start,end]),new THREE.LineBasicMaterial({color:'#c56818',depthTest:false}));
    line.renderOrder=21;group.add(line);
    for(const point of [start,end]) {
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.07,12,8),new THREE.MeshBasicMaterial({color:'#c56818',depthTest:false}));
      marker.userData.comparison_only=true;
      marker.position.copy(point);marker.renderOrder=22;group.add(marker);
    }
    const source=objects().find(object=>sunBlockerInfo(object).id===hit.id);
    if(source) {
      const mesh=new THREE.Mesh(source.geometry,new THREE.MeshBasicMaterial({color:'#d48128',transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
      mesh.userData={sharedGeometry:true,comparison_only:true};mesh.matrixAutoUpdate=false;mesh.matrix.copy(source.matrixWorld);group.add(mesh);
    }
    text.textContent=`${window.label} · ${minuteLabel(bin.sampled_at)} · 最近遮挡：${hit.component}。橙线为诊断连线，可透过模型看到。`;
    note.hidden=false;render();
  }
  return {show,clear};
}
