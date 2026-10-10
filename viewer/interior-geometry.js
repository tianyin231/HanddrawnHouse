import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SHOWER_OPENING_M} from './wet-area-details.js';
import {kitchenFrame} from './kitchen-layout.js';

export function interiorBuilder(group,materials) {
  const buckets=new Map();
  let room='',kind='furniture',active=null;
  const motions=[];
  const add=(material,geometry,x=0,y=0,h=0)=>{
    geometry.translate(x,h,-y);
    const flat=geometry.index?geometry.toNonIndexed():geometry;
    if(flat!==geometry)geometry.dispose();
    flat.deleteAttribute('uv');
    if(active)flat.translate(-active.position.x,-active.position.y,-active.position.z);
    const key=`${room}|${kind}|${material}|${active?.name||''}`;
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(flat);
  };
  const box=(material,x0,y0,x1,y1,z,height,rounded=false)=>{
    if(x1<=x0 || y1<=y0 || height<=0)throw new Error(`室内构件尺寸错误：${room}/${material}`);
    const geometry=rounded?new RoundedBoxGeometry(x1-x0,height,y1-y0,2,Math.min(.028,height/4,(x1-x0)/4,(y1-y0)/4)):
      new THREE.BoxGeometry(x1-x0,height,y1-y0);
    add(material,geometry,(x0+x1)/2,(y0+y1)/2,z+height/2);
  };
  const cylinder=(material,x,y,z,height,r,top=r)=>add(material,new THREE.CylinderGeometry(top,r,height,20),x,y,z+height/2);
  const pipe=(material,points,r=.012)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(([x,y,h])=>new THREE.Vector3(x,h,-y)));
    add(material,new THREE.TubeGeometry(curve,24,r,8,false));
  };
  const bowl=(material,bounds,z,height)=>{
    const [x,y,x1,y1]=bounds,r=.5;
    const profile=[[0,0],[r*.7,0],[r,height*.8],[r,height],[r-.02,height],[r*.68,height*.18],[0,height*.18]];
    const geometry=new THREE.LatheGeometry(profile.map(([a,b])=>new THREE.Vector2(a,b)),32);
    geometry.scale(x1-x,1,y1-y);add(material,geometry,(x+x1)/2,(y+y1)/2,z);
  };
  return {box,cylinder,pipe,bowl,add,
    context(id,type='furniture'){room=id;kind=type;},
    moving(metadata,pivot,draw){
      const node=new THREE.Group();node.name=metadata.id;
      node.position.set(pivot[0],pivot[2],-pivot[1]);
      node.userData={motion:metadata,interior_room:room,model_component:true};
      motions.push(node);active=node;draw();active=null;
    },
    finish(){
      for(const [key,parts] of buckets) {
        const [space,type,name,parent]=key.split('|'),geometry=mergeGeometries(parts);
        parts.forEach(p=>p.dispose());
        const mesh=new THREE.Mesh(geometry,materials[name]);
        mesh.name=`interior/${space}/${type}/${name}`;
        mesh.userData={interior_room:space,interior_kind:type,interior_material:name,concept_only:true};
        mesh.castShadow=!['floor','rug','glass'].includes(name)&&type!=='floor';mesh.receiveShadow=true;
        (motions.find(o=>o.name===parent)||group).add(mesh);
      }
      if(motions.length)group.add(...motions);
    }
  };
}

export function furnish(item,g) {
  if(item.type==='storage-cabinet'&&item.facing==='east'){
    const sum=item.bounds[0]+item.bounds[2],mapped={...g,
      box:(m,x,y,x1,y1,z,h,rounded)=>g.box(m,sum-x1,y,sum-x,y1,z,h,rounded),
      cylinder:(m,x,y,z,h,r,top)=>g.cylinder(m,sum-x,y,z,h,r,top),
      moving:(meta,pivot,draw)=>g.moving({...meta,amount:-meta.amount},[sum-pivot[0],pivot[1],pivot[2]],draw)
    };
    return furnish({...item,facing:'west'},mapped);
  }
  if(item.type==='kitchen'&&item.corner) {
    const f=kitchenFrame(item),mapped={...g,
      box:(m,x,y,x1,y1,z,h,rounded)=>g.box(m,...f.rect([x,y,x1,y1]),z,h,rounded),
      cylinder:(m,x,y,z,h,r,top)=>g.cylinder(m,...f.point([x,y,z]),h,r,top),
      pipe:(m,points,r)=>g.pipe(m,points.map(f.point),r),
      moving:(meta,pivot,draw)=>g.moving({...meta,amount:meta.amount*(f.reflected?-1:1)},f.point(pivot),draw)
    };
    return furnish({...item,bounds:f.bounds,corner:null},mapped);
  }
  const {box:b,cylinder:c,bowl,pipe}=g;
  const [x,y,x1,y1]=item.bounds,w=x1-x,d=y1-y,cx=(x+x1)/2,cy=(y+y1)/2;
  let cabinetIndex=0;
  const cabinet=(bounds,front,z=.10,h=.72,material='wood',leaf=.56,doorMaterial=material,frontEnd=null)=>{
    const owner=`${item.id}/cabinet-${cabinetIndex++}`;
    const [a,q,a1,q1]=bounds,t=.018;
    b(material,a,q,a1,q1,z,t);
    if(z>1||(item.type!=='kitchen'&&item.type!=='vanity'))b(material,a,q,a1,q1,z+h-t,t);
    if(front==='west') {
      b(material,a1-t,q,a1,q1,z,h);b(material,a,q,a1,q+t,z,h);b(material,a,q1-t,a1,q1,z,h);
    } else {
      b(material,a,q,a+t,q1,z,h);b(material,a1-t,q,a1,q1,z,h);
      b(material,a,front==='north'?q:q1-t,a1,front==='north'?q+t:q1,z,h);
    }
    const length=(frontEnd??(front==='west'?q1:a1))-(front==='west'?q:a),count=Math.max(1,Math.round(length/leaf)),step=length/count;
    if(item.type==='wardrobe')for(const h1 of [.5,1.55,2.05])b(material,a+.018,q+.018,a1-.018,q1-.018,z+h1,.018);
    for(let i=0;i<count;i++) {
      const start=(front==='west'?q:a)+i*step+.004,end=start+step-.008;
      // 铰轴落在门板外侧面，避免厚门板回转时卡住相邻闭合门板。
      const pivot=front==='west'?[a-.018,start,0]:[start,front==='north'?q1+.018:q-.018,0];
      g.moving({id:`${owner}/leaf-${i}`,owner,label:`${item.type==='wardrobe'?'衣柜':item.type==='vanity'?'浴室柜':item.type==='storage-cabinet'?'收纳柜':z>1?'吊柜':'地柜'}第 ${i+1} 扇`,type:'hinge',amount:front==='south'?-Math.PI/2:Math.PI/2},pivot,()=>{
      if(front==='west') {
        b(doorMaterial,a-.018,start,a,end,z+.008,h-.016);
        b('metal',a-.042,end-.06,a-.021,end-.045,z+h-.15,.12);
      } else {
        const f=front==='north'?q1:q-.018;
        b(doorMaterial,start,f,end,f+.018,z+.008,h-.016);
        b('metal',end-.065,f+(front==='north'?.02:-.025),end-.05,f+(front==='north'?.042:-.002),z+h-.15,.12);
      }
      });
    }
  };
  const chair=(a,q,north,cloth='cloth')=>{
    for(const dx of [-.18,.18])for(const dy of [-.18,.18])b('wood',a+dx-.023,q+dy-.023,a+dx+.023,q+dy+.023,.025,.41);
    b(cloth,a-.23,q-.23,a+.23,q+.23,.43,.07,true);
    const back=q+(north?.18:-.23);
    b('wood',a-.23,back,a+.23,back+.05,.47,.39,true);
  };
  switch(item.type) {
    case 'storage-cabinet': {
      const top=item.height,closed=item.closedHeight,upper=.08+closed;
      b('metal',x+.04,y+.035,x1-.02,y1-.035,.026,.054);
      cabinet(item.bounds,'west',.08,closed,'wood',.56,'white');
      b('wood',x1-.018,y,x1,y1,upper,top-upper);
      for(const q of [y,y1-.018])b('wood',x,q,x1,q+.018,upper,top-upper);
      b('wood',x,y,x1,y1,top-.018,.018);
      b('wood',x+.018,y+.018,x1-.018,y1-.018,.42,.018);
      if(top>1.5){
        for(const h of [1.27,1.66])b('wood',x,y+.018,x1,y1-.018,h,.018);
        for(let i=0;i<3;i++)b(i===1?'accent':'stone',x+.04,y+.06+i*.055,x+.25,y+.103+i*.055,upper+.02,.25+i*.015);
        c('ceramic',cx,cy,1.678,.19,.058,.038);
        b('cloth',x+.04,y+.045,x1-.035,y1-.045,1.31,.20);
        b('wood',x+.025,y+.04,x1-.025,y1-.04,1.51,.018);
      }else{
        c('wood',cx,cy,top,.012,.13);
        for(const q of [cy-.065,cy+.065])c('ceramic',cx,q,top+.012,.075,.027);
      }
      break;
    }
    case 'wall-art': {
      const z=item.bottom,h=item.height,gap=.16,panel=(d-gap)/2;
      for(let i=0;i<2;i++){
        const a=y+i*(panel+gap),end=a+panel;
        b('wood',x,a,x1,end,z,h);
        b('white',x-.001,a+.028,x+.006,end-.028,z+.028,h-.056);
        // 平面几何画芯：留白、圆日与山形；无外部图片和额外贴图。
        const disc=new THREE.CircleGeometry(.12,24);disc.rotateY(-Math.PI/2);
        g.add(i?'wood':'accent',disc,x-.003,a+panel*.65,z+h*.70);
        const shape=new THREE.BufferGeometry();
        shape.setAttribute('position',new THREE.Float32BufferAttribute([
          x-.004,z+.12,-(a+.09), x-.004,z+h*.61,-(a+panel*.44), x-.004,z+.12,-(end-.09)
        ],3));shape.computeVertexNormals();g.add(i?'accent':'stone',shape);
      }
      break;
    }
    case 'sofa':
      for(const a of [x+.11,x1-.15])for(const q of [y+.15,y1-.15])c('metal',a,q,.03,.15,.028);
      b('wood',x,y,x1,y1,.16,.16,true);b('cloth',x1-.21,y,x1,y1,.30,.64,true);
      for(let i=0;i<3;i++)b('cloth',x+.05,y+.21+i*(d-.42)/3,x1-.20,y+.20+(i+1)*(d-.42)/3,.33,.16,true);
      for(const q of [y,y1-.18])b('cloth',x,q,x1,q+.18,.31,.32,true);
      b('accent',x1-.48,y+.39,x1-.2,y+.88,.49,.36,true);
      b('white',x1-.46,y1-.92,x1-.19,y1-.42,.49,.36,true);
      break;
    case 'coffee-table':
      b('wood',x+.32,y+.20,x1-.34,y1-.20,.035,.31,true);b('stone',x,y,x1,y1,.345,.045,true);
      c('wood',cx,cy,.39,.018,.18);for(const dx of [-.08,.09])c('ceramic',cx+dx,cy,.408,.09,.032);
      break;
    case 'tv-cabinet':
      b('metal',x+.03,y+.03,x1-.07,y1-.03,.026,.075);
      b('wood',x,y,x1,y1,.10,.018);b('wood',x,y,x1,y1,.422,.018);b('wood',x,y,x+.018,y1,.10,.34);
      for(const q of [y,y1-.018])b('wood',x,q,x1,q+.018,.10,.34);
      for(let i=0;i<4;i++) {
        const a=y+i*d/4+.026,q=y+(i+1)*d/4-.026;
        g.moving({id:`${item.id}/drawer-${i}`,owner:item.id,label:`电视柜第 ${i+1} 个抽屉`,type:'slide',direction:[1,0,0],amount:.32},[x,y,0],()=>{
          b('wood',x1,a,x1+.018,q,.12,.282);b('metal',x1+.02,(a+q)/2-.07,x1+.035,(a+q)/2+.07,.35,.015);
          b('wood',x+.028,a+.01,x1-.01,q-.01,.14,.014);
          for(const q0 of [a+.01,q-.028])b('wood',x+.028,q0,x1-.01,q0+.018,.154,.22);
          b('wood',x+.028,a+.01,x+.046,q-.01,.154,.22);
        });
      }
      b('metal',x+.02,cy-.83,x+.08,cy+.83,1.01,.94,true);b('screen',x+.081,cy-.80,x+.087,cy+.80,1.04,.88);
      break;
    case 'floor-lamp':
      c('metal',cx,cy,.026,.035,.18);c('metal',cx,cy,.06,1.29,.014);c('shade',cx,cy,1.35,.30,.24,.17);break;
    case 'bed':
      b('wood',x,y,x1,y1,.055,.25,true);b('wood',x-.06,y1,x1+.06,y1+.075,.04,1.02,true);
      b('white',x+.02,y+.02,x1-.02,y1-.02,.305,.2,true);b('cloth',x-.015,y,x1+.015,y1-.54,.49,.055,true);
      b('accent',x-.015,y+.37,x1+.015,y+.82,.55,.025,true);
      for(const a of [x+.12,cx+.08])b('white',a,y1-.50,a+(w-.42)/2,y1-.10,.51,.105,true);
      break;
    case 'nightstand':
      b('wood',x,y,x+.018,y1,.05,.43);b('wood',x1-.018,y,x1,y1,.05,.43);
      b('wood',x,y1-.018,x1,y1,.05,.43);b('wood',x,y,x1,y1,.05,.018);b('wood',x,y,x1,y1,.462,.018);
      g.moving({id:`${item.id}/drawer`,owner:item.id,label:'床头柜抽屉',type:'slide',direction:[0,0,1],amount:.32},[x,y,0],()=>{
        b('wood',x+.006,y-.018,x1-.006,y,.22,.22);b('metal',x+.13,y-.04,x1-.13,y-.018,.36,.012);
        b('wood',x+.027,y+.016,x1-.027,y1-.03,.22,.016);
        for(const a of [x+.027,x1-.045])b('wood',a,y+.016,a+.018,y1-.03,.236,.17);
        b('wood',x+.027,y1-.048,x1-.027,y1-.03,.236,.17);
      });
      c('metal',cx,cy,.48,.025,.09);c('metal',cx,cy,.505,.19,.012);c('shade',cx,cy,.695,.18,.115,.09);break;
    case 'wardrobe':
      cabinet(item.bounds,item.facing,.026,2.35,'wood',.5,'white');
      break;
    case 'fridge':
      // 保温外壳、内胆和搁板独立建模，门后保留可见储物空腔。
      for(const a of [x,x1-.045])b('steel',a,y,a+.045,y1,.04,1.84);
      b('steel',x,y1-.045,x1,y1,.04,1.84);b('steel',x,y,x1,y1,.04,.07);b('steel',x,y,x1,y1,1.82,.06);
      b('white',x+.045,y+.02,x1-.045,y1-.045,.664,.026);
      for(const h of [.36,.96,1.24,1.52])b('glass',x+.05,y+.055,x1-.05,y1-.05,h,.012);
      for(const [id,z,h,material] of [['lower',.11,.546,'steel'],['upper',.704,1.108,'white']]) {
        g.moving({id:`${item.id}/${id}`,owner:item.id,label:`冰箱${id==='upper'?'冷藏':'冷冻'}室门`,type:'hinge',amount:Math.PI/2},[x1-.015,y-.035,0],()=>{
          b(material,x+.015,y-.035,x1-.015,y,z,h,true);
          b('white',x+.055,y,x1-.055,y+.025,z+.045,h-.09);
          b('metal',x+.045,y-.06,x+.06,y-.035,z+.16,.23);
        });
      }
      break;
    case 'kitchen': {
      const depth=item.depth,n=y1-depth,e=x1-depth,top=.855;
      // L 形转角留 60 毫米收口，不在被另一组柜体遮住的角部设置假柜门。
      cabinet([x,n,e,y1],'south',.10,.72,'wood',.56,'wood',e-.06);
      cabinet([e,y,x1,y1],'west',.10,.72,'wood',.56,'wood',n-.06);
      b('wood',e-.06,n-.018,e,n,.10,.72);b('wood',e-.018,n-.06,e,n,.10,.72);
      b('stone',x,n-.025,e+.015,y1,.82,.035);
      const hole=[e+.12,y+.46,x1-.12,y+1.10];
      // 实体台面四周围合水槽洞，盆底在洞内下沉 19 厘米。
      b('stone',e-.025,y,x1,hole[1],.82,.035);b('stone',e-.025,hole[3],x1,y1,.82,.035);
      b('stone',e-.025,hole[1],hole[0],hole[3],.82,.035);b('stone',hole[2],hole[1],x1,hole[3],.82,.035);
      b('steel',hole[0],hole[1],hole[2],hole[3],.63,.014);
      for(const a of [hole[0],hole[2]-.012])b('steel',a,hole[1],a+.012,hole[3],.644,.204);
      for(const q of [hole[1],hole[3]-.012])b('steel',hole[0],q,hole[2],q+.012,.644,.204);
      c('metal',(hole[0]+hole[2])/2,(hole[1]+hole[3])/2,.644,.004,.035);
      const fy=(hole[1]+hole[3])/2;
      pipe('steel',[[x1-.065,fy,top],[x1-.065,fy,1.1],[x1-.15,fy,1.15],[x1-.28,fy,1.1],[x1-.28,fy,1.03]]);
      const stoveX=x+(e-x)*.56,stoveY=y1-.31;
      b('screen',stoveX-.36,stoveY-.23,stoveX+.36,stoveY+.23,top,.035,true);
      for(const a of [-.19,.19])for(const q of [-.115,.115]) {c('metal',stoveX+a,stoveY+q,.89,.018,.075);b('metal',stoveX+a-.085,stoveY+q-.008,stoveX+a+.085,stoveY+q+.008,.909,.018);}
      b('steel',stoveX-.41,y1-.40,stoveX+.41,y1-.04,1.62,.14,true);
      b('steel',stoveX-.15,y1-.29,stoveX+.15,y1-.04,1.76,1.18);
      b('tileWall',x,y1-.012,x1,y1,.856,.62);b('tileWall',x1-.012,y,x1,y1,.856,.30);
      if(stoveX-.47>x+.35)cabinet([x,y1-.32,stoveX-.47,y1],'south',1.53,.71,'white');
      if(e>stoveX+.47)cabinet([stoveX+.47,y1-.32,e,y1],'south',1.53,.71,'white');
      b('white',x+.07,y1-.021,x+.18,y1-.012,1.13,.07);
      b('metal',x+.09,y1-.024,x+.10,y1-.020,1.153,.02);
      break;
    }
    case 'dining-set':
      for(const a of [x+.13,x1-.13])for(const q of [y+.12,y1-.12])b('wood',a-.035,q-.035,a+.035,q+.035,.025,.70);
      b('wood',x,y,x1,y1,.725,.045,true);
      for(const a of [cx-.43,cx+.43]){chair(a,cy-.68,false);chair(a,cy+.68,true);}
      c('ceramic',cx,cy,.77,.16,.075,.04);break;
    case 'vanity':
      cabinet([x,y,x1,y1],'north',.26,.50,'wood',.35);b('stone',x-.012,y-.012,x1+.012,y1+.012,.76,.035,true);
      bowl('ceramic',[x+.07,y+.065,x1-.07,y1-.04],.795,.11);
      pipe('steel',[[cx,y+.035,.80],[cx,y+.035,1.04],[cx,y+.13,1.04],[cx,y+.15,.99]]);
      b('metal',x+.02,y-.024,x1-.02,y-.005,1.15,.75,true);b('mirror',x+.035,y-.027,x1-.035,y-.025,1.17,.71);
      b('lamp',x+.035,y-.05,x1-.035,y-.02,1.94,.025);break;
    case 'toilet':
      b('ceramic',x1-.13,y+.025,x1,y1-.025,.15,.63,true);
      // 椭圆盆体保留真实凹腔，坐面和水箱分件表达。
      bowl('ceramic',[x,y,x1-.10,y1],.08,.35);
      c('steel',x1-.075,cy,.78,.007,.021);break;
    case 'shower': {
      const wall=x+.035,q=y1-.32;
      pipe('steel',[[wall,q,.96],[wall,q,2.13],[wall+.25,q,2.15],[wall+.34,q,2.12]]);
      c('steel',wall+.34,q,2.095,.025,.095);
      b('steel',wall-.015,q-.1,wall+.04,q+.1,.97,.065,true);
      pipe('steel',[[wall+.025,q+.03,.97],[wall+.07,q+.20,.64],[wall+.10,q+.30,1.45]],.008);
      // 北端固定玻璃挡水，南端留约 0.85 米开放入口；不假设玻璃门能在狭窄房间内回转。
      const start=y+SHOWER_OPENING_M;
      b('glass',x1-.012,start,x1,y1,.026,1.99);
      for(const q0 of [start,y1-.012])b('metal',x1-.02,q0,x1+.005,q0+.012,.026,2.02);
      b('metal',x1-.02,start,x1+.005,y1,2.033,.015);
      break;
    }
    case 'reading-set':
      for(const a of [x+.40,x+1.62]) {
        b('wood',a-.34,y1-.81,a+.34,y1-.04,.15,.15,true);
        b('cloth',a-.31,y1-.79,a+.31,y1-.20,.30,.14,true);
        b('cloth',a-.34,y1-.21,a+.34,y1-.04,.30,.58,true);
        for(const dx of [-.28,.28])for(const q of [y1-.72,y1-.13])b('wood',a+dx-.025,q-.025,a+dx+.025,q+.025,.025,.15);
      }
      c('wood',x+1.03,y+.45,.026,.40,.12);c('stone',x+1.03,y+.45,.426,.035,.34);break;
    case 'desk':
      for(const a of [x+.07,x1-.07])for(const q of [y+.07,y1-.07])b('wood',a-.025,q-.025,a+.025,q+.025,.025,.70);
      b('wood',x,y,x1,y1,.725,.035,true);chair(cx,y-.31,false);
      b('white',x+.10,y+.10,x+.40,y+.32,.76,.035);b('accent',x+.11,y+.10,x+.39,y+.32,.795,.015);break;
    default:throw new Error(`未实现的室内构件：${item.type}`);
  }
}
