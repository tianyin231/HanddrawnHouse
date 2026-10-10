import {readFileSync} from 'node:fs';
import {createInteriorDesign,interiorMaterials} from '../viewer/interior-design.js';
import {createDoorDesign} from '../viewer/door-design.js';
import {createCirculationDesign} from '../viewer/circulation-design.js';
const read=name=>JSON.parse(readFileSync(new URL(`../${name}`,import.meta.url),'utf8'));
const level=Number(process.argv[2]||1),style=process.argv[3]||'a';
const p=read('house_parameters.json'),plan=read(`plan_floor_${level}.json`);
const options=interiorMaterials(level,style);
const groups=[createInteriorDesign(p,plan,style),createDoorDesign(p,plan),createCirculationDesign(p,plan,options)];
function pack(obj){
  const node={name:obj.name,metadata:obj.userData,position:obj.position.toArray(),children:obj.children.map(pack)};
  if(obj.isMesh)Object.assign(node,{material:options[obj.userData.interior_material],
    positions:Array.from(obj.geometry.attributes.position.array),normals:Array.from(obj.geometry.attributes.normal.array)});
  return node;
}
process.stdout.write(JSON.stringify(groups.map(pack)));
