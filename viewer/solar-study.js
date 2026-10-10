import * as THREE from 'three';
import {sunBlockerInfo} from './solar-obstructions.js';

const RAD = Math.PI / 180;

// NOAA 的年角近似式；输入是所在地民用时间，不经过浏览器时区转换。
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function solarPosition(date, hour, location) {
  const [year, month, day] = date.split('-').map(Number);
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000 + 1;
  const g = 2 * Math.PI / days * (dayOfYear - 1 + (hour - 12) / 24);
  const equation = 229.18 * (.000075 + .001868*Math.cos(g) - .032077*Math.sin(g)
    - .014615*Math.cos(2*g) - .040849*Math.sin(2*g));
  const declination = .006918 - .399912*Math.cos(g) + .070257*Math.sin(g)
    - .006758*Math.cos(2*g) + .000907*Math.sin(2*g) - .002697*Math.cos(3*g) + .00148*Math.sin(3*g);
  const ha = (hour*60 + equation + 4*location.longitude - 60*location.utc_offset_hours) / 4 * RAD - Math.PI;
  const lat = location.latitude * RAD;
  const altitude = Math.asin(Math.sin(lat)*Math.sin(declination) + Math.cos(lat)*Math.cos(declination)*Math.cos(ha));
  const azimuth = (Math.atan2(Math.sin(ha), Math.cos(ha)*Math.sin(lat) - Math.tan(declination)*Math.cos(lat)) + Math.PI + 2*Math.PI) % (2*Math.PI);
  // 北向偏角：图纸上方在实地偏离真北的顺时针角度。
  const modelAzimuth = azimuth - (location.north_rotation_deg || 0)*RAD;
  return {
    altitude: altitude/RAD, azimuth: azimuth/RAD,
    direction: new THREE.Vector3(Math.sin(modelAzimuth)*Math.cos(altitude), Math.sin(altitude), -Math.cos(modelAzimuth)*Math.cos(altitude))
  };
}

export const NEIGHBOR_DEFAULTS = { north: 2.4, south: 3.6, east: 6.4 };

export function neighborLayout(p, heights = NEIGHBOR_DEFAULTS) {
  const w = p.site_width/1000, d = (p.courtyard_depth+p.house_depth)/1000;
  const middle = values => (values[0]+values[1])/2000;
  return [
    {id:'north', label:'北侧院墙', bounds:[0, d+middle(p.site_context.north_gap_mm), w, d+middle(p.site_context.north_gap_mm)+.24], height:heights.north},
    {id:'south', label:'南侧一层邻房', bounds:[0, -middle(p.site_context.south_gap_mm)-6, w, -middle(p.site_context.south_gap_mm)], height:heights.south},
    {id:'east', label:'东侧邻房', bounds:[w+p.site_context.east_gap_mm/1000, 0, w+p.site_context.east_gap_mm/1000+6, d], height:heights.east}
  ];
}

export function createNeighbors(p, heights) {
  const group = new THREE.Group();
  group.name = 'NeighborStudy';
  group.userData.scenario_only = true;
  for (const item of neighborLayout(p, heights)) {
    const [x0,y0,x1,y1] = item.bounds;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1-x0, item.height, y1-y0),
      new THREE.MeshStandardMaterial({color:'#bec3c0', roughness:1}));
    mesh.position.set((x0+x1)/2, -p.entrance_proposal.yard_drop_mm/1000+item.height/2, -(y0+y1)/2);
    mesh.name = item.id;
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({color:'#8d9891'}));
    mesh.add(edges);
  }
  return group;
}

export function windowSamples(p, plans) {
  const targets=[];
  for(const plan of plans)for(const opening of plan.openings.filter(o=>o.kind==='window')) {
    const level=plan.level,space=plan.spaces.find(s=>s.id===opening.space_id);
    const wall = plan.walls.find(item=>item.id===opening.wall_id);
    const dx=wall.b[0]-wall.a[0], dy=wall.b[1]-wall.a[1], length=Math.hypot(dx,dy);
    const [x,y,x1,y1]=space.clear_bounds_mm,horizontal=dy===0;
    const normal=horizontal?new THREE.Vector3(0,0,(y+y1)/2>wall.a[1]?1:-1):new THREE.Vector3((x+x1)/2>wall.a[0]?-1:1,0,0);
    const face=horizontal?(normal.z>0?'南':'北'):(normal.x>0?'东':'西');
    const points=[];
    for(const a of [.2,.5,.8]) for(const h of [.2,.5,.8]) {
      const distance=opening.offset+opening.width*a;
      points.push(new THREE.Vector3((wall.a[0]+dx/length*distance)/1000,
        ((level-1)*p.floor_to_floor+opening.sill+(opening.head-opening.sill)*h)/1000,
        -(wall.a[1]+dy/length*distance)/1000).addScaledVector(normal,wall.thickness/2000+.03));
    }
    targets.push({id:`${level}:${opening.id}`,opening_id:opening.id,level,space:space.id,face,label:`${level}层${space.label} · ${face}窗`,points,normal});
  }
  for(const target of targets) {
    const same=targets.filter(t=>t.label===target.label);
    if(same.length>1)same.forEach((t,i)=>{t.label+=` ${i+1}`;});
  }
  return targets;
}

// 固定本次计算的矩阵；先排除射线不可能碰到的包围盒，命中实体后立即停止。
export function prepareSunBlockers(objects) {
  const meshes=objects.map(source=>{
    source.geometry.computeBoundingBox();
    const mesh=new THREE.Mesh(source.geometry,source.material);
    mesh.matrixAutoUpdate=false;mesh.matrixWorld.copy(source.matrixWorld);
    return {mesh,box:source.geometry.boundingBox.clone().applyMatrix4(source.matrixWorld),info:sunBlockerInfo(source)};
  });
  const blocked=ray=>{
    const hits=[];
    for(const {mesh,box} of meshes) {
      if(!ray.ray.intersectsBox(box))continue;
      mesh.raycast(ray,hits);
      if(hits.length)return true;
    }
    return false;
  };
  blocked.trace=ray=>{
    let nearest=null;const groups=new Set(),hits=[];
    for(const {mesh,box,info} of meshes) {
      if(!ray.ray.intersectsBox(box))continue;
      hits.length=0;mesh.raycast(ray,hits);
      for(const hit of hits) {
        groups.add(info.group);
        if(!nearest||hit.distance<nearest.distance)nearest={...info,distance:hit.distance,point_m:hit.point.toArray()};
      }
    }
    return {hit:nearest,groups:[...groups].sort()};
  };
  return blocked;
}

export function centerSunDiagnostic(target,solar,blocked) {
  if(solar.altitude<=0)return {state:'night'};
  if(target.normal.dot(solar.direction)<=0)return {state:'back'};
  const origin=target.points[Math.floor(target.points.length/2)];
  const result=blocked.trace(new THREE.Raycaster(origin,solar.direction,.002,120));
  return {state:result.hit?'blocked':'direct',...result};
}

// 窗外九个几何样点，只判断是否有不透明构件遮住太阳，不推算室内照度。
export function directSunSamples(targets, solar, objects) {
  const ray = new THREE.Raycaster(undefined, solar.direction, .002, 120);
  const blocked=typeof objects==='function'?objects:prepareSunBlockers(objects);
  return targets.map(target => {
    const visible=target.points.map(()=>false);
    if (solar.altitude > 0 && target.normal.dot(solar.direction) > 0) {
      for(const [index,point] of target.points.entries()) {
        ray.ray.origin.copy(point);visible[index]=!blocked(ray);
      }
    }
    return {id:target.id,label:target.label,direct:visible.filter(Boolean).length,total:visible.length,center:visible[Math.floor(visible.length/2)],visible};
  });
}
