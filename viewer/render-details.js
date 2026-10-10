import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

// 细纹按米生成，保持原方案颜色；不依赖外部贴图，也不改变模型尺寸。
function surfaceTexture(kind) {
  const size=256,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const noise=((Math.imul(x+17,73856093)^Math.imul(y+31,19349663))>>>0)%997/997;
    const grain=Math.sin(x*.72+Math.sin(y*.025)*2.4+Math.sin(x*.06+y*.008));
    const weave=(Math.cos(x*Math.PI/4)+Math.cos(y*Math.PI/4))*.5;
    const value=kind==='wood'?239+grain*9+noise*5:kind==='cloth'?245+weave*6+noise*3:247+noise*8;
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  texture.repeat.setScalar(kind==='wood'?1.5:kind==='cloth'?6:2);
  return texture;
}

export function applySurfaceDetails(scene,renderer) {
  const textures=Object.fromEntries(['wood','cloth','stone'].map(k=>[k,surfaceTexture(k)]));
  for(const texture of Object.values(textures))texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  let count=0;
  scene.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.material.isMeshStandardMaterial)return;
    const material=mesh.material,key=mesh.userData.interior_material,name=material.name;
    const upper=name.startsWith('interior/2/');
    const kind=key==='wood'||(upper&&['floor','floorAlt'].includes(key))?'wood':
      ['cloth','rug','accent','shade'].includes(key)?'cloth':
      ['floor','floorAlt','tile','tileWall','stone','ceramic','white','ceiling'].includes(key)||/wall-ivory|display\/stair|exterior\/plinth/.test(name)?'stone':null;
    if(kind){
      const geometry=mesh.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal;
      const uv=new Float32Array(position.count*2);
      for(let i=0;i<position.count;i++){
        const x=Math.abs(normal.getX(i)),y=Math.abs(normal.getY(i)),z=Math.abs(normal.getZ(i));
        uv[2*i]=x>y&&x>z?position.getZ(i):position.getX(i);
        uv[2*i+1]=y>x&&y>z?position.getZ(i):position.getY(i);
      }
      geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      const painted=['white','ceiling'].includes(key)||name.includes('wall-ivory');
      if(!painted)material.map=textures[kind];
      material.bumpMap=textures[kind];material.bumpScale=painted?.00015:kind==='wood'?.0008:.0004;
      material.roughness=painted?.92:kind==='cloth'?.96:kind==='wood'?.62:key==='stone'?.4:.57;
      material.userData.detailRoughness=material.roughness;
      material.needsUpdate=true;count++;
    }
    if(['steel','metal','mirror','screen'].includes(key))material.envMapIntensity=key==='mirror'?1:.65;
    if(mesh.userData.glazing_proxy){material.roughness=.035;material.envMapIntensity=.8;}
  });
  return count;
}

export function createRenderDetails(renderer,scene,camera) {
  const composer=new EffectComposer(renderer),color=new RenderPass(scene,camera);
  const contact=new GTAOPass(scene,camera,1,1,undefined,
    {radius:.32,thickness:.12,distanceFallOff:1,samples:12,screenSpaceRadius:false},
    {radius:4,samples:8,depthPhi:2,normalPhi:5});
  contact.blendIntensity=.62;
  composer.addPass(color);composer.addPass(contact);composer.addPass(new OutputPass());
  // 玻璃不应在法线/深度通道中被当成不透光墙面。
  const glass=[];scene.traverse(o=>{if(o.isMesh&&(o.userData.glazing_proxy||o.userData.interior_material==='glass'||o.material.transmission>0))glass.push(o);});
  const transmission=new Map();
  for(const mesh of glass)if(mesh.material.transmission>0&&!transmission.has(mesh.material)){
    const {transmission:amount,opacity,transparent}=mesh.material;
    transmission.set(mesh.material,{amount,opacity,transparent});
  }
  const renderContact=contact.render.bind(contact);
  contact.render=(...args)=>{
    const shown=glass.filter(o=>o.visible);for(const o of shown)o.visible=false;
    const shadowUpdate=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
    try{renderContact(...args);}finally{for(const o of shown)o.visible=true;renderer.shadowMap.autoUpdate=shadowUpdate;}
  };
  let enabled=true,fastGlass=false;
  return {
    resize(width,height,mode,compact,walking=false){
      enabled=mode==='clear'||(mode==='auto'&&!compact&&!walking);
      const nextFast=mode==='smooth'||(walking&&mode!=='clear');
      if(nextFast!==fastGlass){
        fastGlass=nextFast;
        // 漫游用透明反射玻璃，省去整场景透射渲染；清晰档保留折射和接触阴影。
        for(const [material,original] of transmission){
          material.transmission=fastGlass?0:original.amount;
          material.opacity=fastGlass?.16:original.opacity;
          material.transparent=fastGlass||original.transparent;material.needsUpdate=true;
        }
      }
      composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(width,height);
      const samples=mode==='clear'?4:2;
      for(const target of [composer.renderTarget1,composer.renderTarget2])if(target.samples!==samples){target.samples=samples;target.dispose();}
      // 接触阴影用半分辨率，再做保边去噪。
      contact.setSize(Math.ceil(width*renderer.getPixelRatio()*.65),Math.ceil(height*renderer.getPixelRatio()*.65));
    },
    render(camera,state){
      if(!enabled||state.cut||state.solar||state.useZones){renderer.render(scene,camera);return;}
      color.camera=contact.camera=camera;
      const perspective=camera.isPerspectiveCamera?1:0;
      if(contact.gtaoMaterial.defines.PERSPECTIVE_CAMERA!==perspective){contact.gtaoMaterial.defines.PERSPECTIVE_CAMERA=perspective;contact.gtaoMaterial.needsUpdate=true;}
      composer.render();
    }
  };
}
