import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachRoofConcept, roofIsVisible } from './roof-concept.js';
import { createCourtyardDesign, courtyardLayout, gardenIsVisible } from './courtyard-design.js';
import {yardElevationAt} from './site-layout.js';
import {setupSolarControls} from './solar-controls.js';
import {createInteriorDesign,applyInteriorStyle,createUseZones,INTERIOR_STYLES} from './interior-design.js';
import {interiorLayout,interiorViewpoint} from './interior-layout.js';
import {createDoorDesign} from './door-design.js';
import {createWalkWorld,gateObstacles,touchesBody} from './walk-world.js';
import {collectMotions,createMotionControls} from './motion-controls.js';
import {createWalkControls} from './walk-controls.js';
import {servicePoints} from './service-points.js';

const $ = (selector) => document.querySelector(selector);
const viewport = $('#viewport');
const state = { view: 'whole', cut: false, labels: true, suite: false, top: false, selected: '', daylight: false, roof: true, garden: true, mood: 'day', gateOpen:true, interior:true, interiorStyle:'a', roomView:'',useZones:false };
const roots = new Map(), roomMeshes = new Map(), labels = [], cutPlanes = new Map();
const caps = new Map(), corrections = new Map();
const windowFrames = [];
const suiteIds = new Set(['master-bedroom', 'bathroom-lower', 'suite-passage']);
const quietLabels = new Set(['west-passage', 'suite-passage', 'east-vestibule']);
let parameters, plans, renderer, scene, camera, controls;
let roofConcept = null, rainwaterSystem = null;
let gardenDesign, orbitCamera, courtyardCamera, skyLight, sunLight, ground;
let solarControls;
let interiorCamera;
let walkCamera,walkControls,motionControls;
let serviceMarker;
const doorGroups=[];
const interiors=new Map();
const interiorLayouts=new Map(),interiorZones=new Map();
const interiorLights=[];
const gardenLights = [], gardenEmitters = [], glazingGroups = [];
const gateLeaves=[];
let needsRender = true;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const coordinate = (x, y, h = 0) => new THREE.Vector3(x / 1000, h, -y / 1000);

function makeLabel(level, text, point, id = '', kind = '') {
  const element = document.createElement(id ? 'button' : 'span');
  element.className = `room-label ${kind}`;
  if (id) {
    const floorTag = document.createElement('small');
    floorTag.textContent = `${level}层`;
    element.append(floorTag, text);
    element.setAttribute('aria-label', `${level}层${text}`);
    element.addEventListener('click', () => selectRoom(`${level}:${id}`));
  } else element.textContent = text;
  $('#room-labels').append(element);
  labels.push({ level, element, point, id, correction: Boolean(kind) });
}

function makeCutCaps(plan, root) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#75858b' });
  // 剖切平面在楼层地面以上 1.2 米，补上墙体截面，并保留这个高度的门洞。
  for (const wall of plan.walls) {
    const relativeCut = 1200 + (plan.level === 1 && /^(yard-|annex-)/.test(wall.id) ? parameters.entrance_proposal.yard_drop_mm : 0);
    if (wall.height <= relativeCut) continue;
    const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1];
    const length = Math.hypot(dx, dy);
    const holes = plan.openings.filter(o => o.wall_id === wall.id && (o.sill || 0) <= relativeCut && o.head > relativeCut)
      .map(o => [o.offset, o.offset + o.width]).sort((a, b) => a[0] - b[0]);
    let start = 0;
    for (const [end, next] of [...holes, [length, length]]) {
      if (end > start) {
        const center = (start + end) / 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry((end - start) / 1000, .012, wall.thickness / 1000), material);
        mesh.position.copy(coordinate(wall.a[0] + dx * center / length, wall.a[1] + dy * center / length, 1.2));
        mesh.rotation.y = Math.atan2(dy, dx);
        group.add(mesh);
      }
      start = next;
    }
  }
  root.add(group);
  caps.set(plan.level, group);
}

function makeCorrections(plan, root) {
  const group = new THREE.Group();
  const x = parameters.west_bay_width, y = parameters.suite_entry_y;
  const north = parameters.courtyard_depth + parameters.house_depth - parameters.north_room_depth;
  const bar = (width, depth, color, cx, cy) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width / 1000, .045, depth / 1000), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(coordinate(cx, cy, .06));
    group.add(mesh);
  };
  const door = plan.openings.find(o => o.id === 'master-suite-entry-door');
  const host = plan.walls.find(w => w.id === door.wall_id);
  bar(door.width, 90, '#d53d40', host.a[0] + door.offset + door.width / 2, y);
  bar(90, north - y, '#ddb323', x, (north + y) / 2);
  root.add(group);
  corrections.set(plan.level, group);
  makeLabel(plan.level, '套间门', coordinate(x + 900, y - 100, .10), '', 'correction-label');
  makeLabel(plan.level, '敞开', coordinate(x + 900, north - 250, .10), '', 'correction-label open-label');
}

function visibleLevels() {
  return state.view === 'floor1' ? [1] : state.view === 'floor2' ? [2] : [1, 2];
}

function updateSelection() {
  for (const [key, mesh] of roomMeshes) {
    const id = key.split(':')[1];
    mesh.material.color.copy(mesh.userData.baseColor);
    if (state.suite && suiteIds.has(id)) mesh.material.color.set('#b3cee6');
    if (key === state.selected) mesh.material.color.set('#77add7');
  }
  for (const label of labels) label.element.classList.toggle('selected', `${label.level}:${label.id}` === state.selected);
  needsRender = true;
}

function selectRoom(key) {
  state.selected = key;
  $('#room-select').value = key;
  const [level, id] = key.split(':');
  const plan = plans.find(p => p.level === Number(level));
  const space = plan?.spaces.find(s => s.id === id);
  $('#kitchen-window').hidden = id !== 'kitchen';
  if (!space) {
    $('#room-name').textContent = '选择一个房间';
    $('#room-size').textContent = '可以查看暂定尺寸与相邻空间。';
    $('#room-connections').textContent = '';
    $('#room-daylight').textContent = '';
    $('#room-furnishing').textContent='';
  } else {
    $('#room-name').textContent = `${level}层 · ${space.label}`;
    const size = values => values.map(value => (value / 1000).toFixed(2)).join(' × ');
    $('#room-size').textContent = `含墙分配 ${size(space.nominal_size_mm)} 米；按暂定墙厚，净范围约 ${size(space.clear_size_mm)} 米（未扣柱及饰面）。`;
    const adjacent = plan.connections.filter(c => c.spaces.includes(id)).map(c => {
      const other = plan.spaces.find(s => s.id === c.spaces.find(value => value !== id));
      return `${other.label}${c.kind === 'open' ? '（敞开）' : '（门）'}`;
    });
    $('#room-connections').textContent = id === 'bathroom-lower' ? '主卧独立卫浴，仅从套内过道进入。' : `相邻：${adjacent.join('、')}`;
    const windows = plan.openings.filter(o => o.kind === 'window' && o.space_id === id);
    $('#room-daylight').textContent = ['bedroom-middle', 'north-living'].includes(id)
      ? '采光待解决：北侧紧邻院墙，小高窗效果未知；借厅光不能替代直接采光。'
      : id === 'stairwell' ? `从门廊上楼，厅堂直通敞口已补墙。左右折返，${plan.stairs.riser_count}级，每级高${plan.stairs.riser_height}mm，踏面${plan.stairs.tread_depth}mm；通行净宽约${plan.stairs.flight_clear_width}mm。`
      : id === 'kitchen' ? '新增南向推拉窗：宽2.4米、高1.4米、窗台1.2米；窗外梯段、栏杆和楼板仍有遮挡。东窗保留，南窗补充采光和通风。'
      : windows.length ? `建议 ${windows.length} 处窗洞，窗台高 ${[...new Set(windows.map(o => (o.sill / 1000).toFixed(1)))].join(' / ')} 米；见完整墙体视图。` : '';
    const roomItems=interiorLayouts.get(Number(level))?.items.filter(item=>item.space===id)||[];
    const names={sofa:'沙发','coffee-table':'茶几','tv-cabinet':'电视柜','floor-lamp':'落地灯',bed:'床',nightstand:'床头柜',wardrobe:'衣柜',kitchen:'L 形台面、灶台、水槽与烟机',fridge:'冰箱','dining-set':'四人餐桌椅',vanity:'洗手盆柜',toilet:'坐便器',shower:'开放入口淋浴区','reading-set':'阅读座椅',desk:'书桌'};
    $('#room-furnishing').textContent=roomItems.length?`室内方案：${roomItems.map(item=>names[item.type]).join('、')}。${['kitchen','bathroom-lower','bathroom-upper'].includes(id)?'排水、排烟与防水接法待现场深化。':'家具规格与开合空间仍待选型复核。'}`:'';
  }
  updateSelection();
}

function populateRooms() {
  const select = $('#room-select');
  select.replaceChildren(new Option('点击模型中的房间', ''));
  for (const plan of plans.filter(p => visibleLevels().includes(p.level))) {
    const group = document.createElement('optgroup');
    group.label = `${plan.level}层`;
    for (const space of plan.spaces) group.append(new Option(space.label, `${plan.level}:${space.id}`));
    select.append(group);
  }
  selectRoom('');
}

function updateView() {
  if(walkControls?.active&&(state.solar||state.cut||!state.roof||state.view!=='whole'))stopWalking();
  if(state.solar&&(state.cut||!state.roof||!['whole','courtyard'].includes(state.view)))state.solar=false;
  if(state.solar)state.roomView='';
  for (const [level, root] of roots) {
    root.visible = visibleLevels().includes(level);
    root.position.y = (level - 1) * parameters.floor_to_floor / 1000 + (level === 2 && state.view === 'exploded' ? 5.4 : 0);
    cutPlanes.get(level).constant = root.position.y + (state.cut ? 1.2 : 30);
    caps.get(level).visible = state.cut;
    corrections.get(level).visible = state.suite;
  }
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  $('#view-title').textContent = { floor1: '一层', floor2: '二层', whole: '整栋住宅', exploded: '两层展开', courtyard: '院中视角' }[state.view];
  $('#view-subtitle').textContent = [state.cut ? '1.2 米剖切' : '完整墙体', state.view === 'exploded' ? '楼层间距仅用于展示' : ''].filter(Boolean).join(' · ');
  $('#cutaway').checked = state.cut;
  $('#suite').setAttribute('aria-pressed', String(state.suite));
  $('.correction-key').hidden = !state.suite;
  $('#daylight').setAttribute('aria-pressed', String(state.daylight));
  for (const obj of windowFrames) {
    obj.material.emissive.set(state.daylight ? '#238ba3' : '#000000');
    obj.material.emissiveIntensity = state.daylight ? .55 : 0;
  }
  $('#view-subtitle').textContent += state.daylight ? ' · 蓝色窗洞为采光建议' : '';
  if (roofConcept) roofConcept.visible = roofIsVisible(state);
  const roofVisible = Boolean(roofConcept?.visible);
  $('#roof-concept').setAttribute('aria-pressed', String(roofVisible));
  $('#roof-concept').textContent = roofVisible ? '隐藏屋顶概念' : '查看屋顶概念';
  if (roofVisible) $('#view-subtitle').textContent += ' · 概念屋顶，待复核';
  if (gardenDesign) gardenDesign.visible = gardenIsVisible(state);
  for (const group of glazingGroups) group.visible = !state.cut && !state.daylight;
  if (rainwaterSystem) rainwaterSystem.visible = roofIsVisible(state);
  for(const gate of gateLeaves){gate.rotation.y=state.gateOpen?gate.userData.open_angle:0;gate.visible=!state.cut;}
  $('#gate-toggle').textContent=state.gateOpen?'关闭院门':'打开院门';
  $('#gate-toggle').setAttribute('aria-pressed',String(state.gateOpen));
  if (state.view === 'courtyard') $('#view-subtitle').textContent = '起始眼高 1.65 米 · 拖动环看';
  for(const group of interiors.values()) {
    group.visible=state.interior && !state.solar;
    group.traverse(obj=>{if(obj.userData.interior_kind==='ceiling')obj.visible=Boolean(state.roomView)||(!state.cut&&['whole','courtyard'].includes(state.view));});
  }
  for(const group of doorGroups)group.visible=!state.cut;
  if(serviceMarker)serviceMarker.visible=Boolean(state.roomView)&&serviceMarker.userData.roomKey===state.roomView;
  if(!walkControls?.active)for(const light of interiorLights)light.visible=Boolean(state.roomView)&&light.userData.roomKey===state.roomView;
  for(const group of interiorZones.values())group.visible=state.interior&&state.useZones&&!state.solar&&!state.roomView;
  $('#interior-preview').checked=state.interior;
  $('#interior-use-zones').checked=state.useZones;
  $('#interior-room-select').value=state.roomView;
  document.querySelectorAll('[data-interior-style]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.interiorStyle===state.interiorStyle)));
  $('#interior-description').textContent=INTERIOR_STYLES[state.interiorStyle].description;
  if(state.roomView) {
    const [level,id]=state.roomView.split(':'),plan=plans.find(p=>p.level===Number(level));
    $('#view-title').textContent=`${level}层${plan.spaces.find(s=>s.id===id).label} · 室内方案`;
    $('#view-subtitle').textContent=`${INTERIOR_STYLES[state.interiorStyle].label} · 暂定布置，待复核`;
  }
  if(walkControls?.active){$('#view-title').textContent='在小院里走一走';$('#view-subtitle').textContent='完整两层 · 台阶与楼梯按当前模型通行';}
  updateGardenLighting();
  scene.updateMatrixWorld(true);
  updateSelection();
}

function updateGardenLighting() {
  if (solarControls?.applyLighting()) return;
  const evening = state.mood === 'evening' && gardenIsVisible(state);
  viewport.classList.toggle('evening', evening);
  scene.background.set(evening ? '#526275' : '#e6ebe4');
  ground.material.color.set(evening ? '#778a83' : '#e6ebe4');
  skyLight.intensity = evening ? .8 : 2.1;
  skyLight.color.set(evening ? '#b2c5df' : '#fffdf2');
  skyLight.groundColor.set(evening?'#535960':'#a5a59e');
  sunLight.intensity = evening ? .48 : 2.5;
  sunLight.color.set(evening ? '#ffbf81' : '#fff4df');
  sunLight.position.set(-8,25,9);
  sunLight.target.position.set(parameters.site_width/2000,0,-10);
  renderer.toneMappingExposure = evening ? 1.05 : .98;
  for (const light of gardenLights) light.visible = evening;
  for (const material of gardenEmitters) material.emissiveIntensity = evening ? 4 : .35;
  document.querySelectorAll('[data-mood]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mood === (evening ? 'evening' : 'day'))));
  $('#garden-design').checked = state.garden;
  needsRender = true;
}

function fitCamera() {
  if(walkControls?.active){camera=walkCamera;resize();needsRender=true;return;}
  camera = state.roomView ? interiorCamera : state.view === 'courtyard' ? courtyardCamera : orbitCamera;
  controls.object = camera;
  if(state.roomView) {
    const [level,id]=state.roomView.split(':');
    const view=interiorViewpoint(parameters,plans.find(p=>p.level===Number(level)),id);
    camera.position.fromArray(view.eye);controls.target.fromArray(view.target);
    camera.aspect=viewport.clientWidth/viewport.clientHeight;
    camera.fov=Math.min(88,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(31))/Math.min(camera.aspect,1))));
    camera.updateProjectionMatrix();controls.update();
    $('#top-view').setAttribute('aria-pressed','false');needsRender=true;return;
  }
  if (state.view === 'courtyard') {
    const yardHeight = yardElevationAt(parameters,.85);
    camera.position.set(6.7, yardHeight + 1.65, -.85);
    controls.target.set(5.1, yardHeight + 2.15, -7);
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.fov = Math.min(88, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) / Math.min(camera.aspect, 1))));
    camera.updateProjectionMatrix();
    controls.update();
    $('#top-view').setAttribute('aria-pressed', 'false');
    needsRender = true;
    return;
  }
  const bounds = new THREE.Box3();
  // 隐藏的屋顶和剖切补面不应撑大室内视图的相机范围。
  for (const root of roots.values()) root.traverseVisible(obj => {
    if (obj.isMesh) bounds.union(new THREE.Box3().setFromObject(obj));
  });
  const neighborBounds=solarControls?.bounds();
  if(neighborBounds) bounds.union(neighborBounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = state.top ? new THREE.Vector3(0, 1, .0001) : new THREE.Vector3(.65, 1.1, 1.35).normalize();
  camera.zoom = 1;
  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(direction, 50);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const inverse = camera.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const aspect = viewport.clientWidth / viewport.clientHeight;
  const height = Math.max(maxY - minY, (maxX - minX) / aspect) * 1.18;
  camera.userData.height = height;
  camera.left = -height * aspect / 2; camera.right = height * aspect / 2;
  camera.top = height / 2; camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  $('#top-view').setAttribute('aria-pressed', String(state.top));
  needsRender = true;
}

function positionLabels() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  const occupied = [];
  // 优先放置套间更正标注，其次放置房间名；过密时隐藏重叠名称。
  const ordered = [...labels].sort((a, b) => Number(b.correction) - Number(a.correction));
  for (const label of ordered) {
    const root = roots.get(label.level);
    const allowed = !walkControls?.active && !state.roomView && !roofConcept?.visible && root.visible && (label.correction ? state.suite : state.labels) && !(state.view === 'whole' && label.level === 1);
    label.element.hidden = !allowed;
    if (!allowed) continue;
    const point = root.localToWorld(label.point.clone()).project(camera);
    const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
    const w = label.element.offsetWidth / 2, h = label.element.offsetHeight / 2;
    const rect = [x - w - 2, y - h - 2, x + w + 2, y + h + 2];
    const hidden = point.z < -1 || point.z > 1 || x < 0 || x > width || y < 50 || y > height - 38 ||
      occupied.some(r => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1]);
    label.element.hidden = hidden;
    if (!hidden) { label.element.style.left = `${x}px`; label.element.style.top = `${y}px`; occupied.push(rect); }
  }
}

function applyQuality() {
  const mode=$('#render-quality').value,compact=window.innerWidth<900;
  const ratio=Math.min(window.devicePixelRatio,mode==='smooth'?1:mode==='clear'?2:compact?1.25:1.75);
  const mapSize=mode==='smooth'||(mode==='auto'&&compact)?1024:2048;
  if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);
  if(sunLight&&sunLight.shadow.mapSize.x!==mapSize){sunLight.shadow.map?.dispose();sunLight.shadow.map=null;sunLight.shadow.mapSize.set(mapSize,mapSize);}
  $('#quality-note').textContent=mode==='smooth'?'优先流畅，适合手机或较慢设备。':mode==='clear'?'保留更细致的轮廓与阴影，渲染负担较高。':'按窗口大小调整，可按实际流畅度切换。';
}

function resize() {
  applyQuality();
  const width = viewport.clientWidth, height = viewport.clientHeight;
  renderer.setSize(width, height);
  if (camera.isPerspectiveCamera) {
    camera.aspect = width / height;
    camera.fov = Math.min(88, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) / Math.min(camera.aspect, 1))));
  }
  else {
    const half = (camera.userData.height || 28) / 2;
    camera.left = -half * width / height; camera.right = half * width / height;
    camera.top = half; camera.bottom = -half;
  }
  camera.updateProjectionMatrix();
  needsRender = true;
}

function updateDrawing() {
  const floor = $('#drawing-floor').value;
  $('#plan-image').src = `/output/floor-${floor}-plan.png`;
  $('#reference-image').src = `/work/reference-floor-${floor}.png`;
}

function stopWalking() {
  if(!walkControls?.active)return;
  walkControls.stop();controls.enabled=true;viewport.classList.remove('walking');
  camera=orbitCamera;controls.object=camera;
  $('#walk-start').textContent='进入自由行走';
  updateView();fitCamera();
}

function motionAt(ndc,limit=Infinity) {
  scene.updateMatrixWorld(true);raycaster.setFromCamera(ndc,camera);
  const visible=[];scene.traverseVisible(o=>{if(o.isMesh&&!o.userData.comparison_only)visible.push(o);});
  const hit=raycaster.intersectObjects(visible,false)[0];
  if(!hit||hit.distance>limit)return null;
  return motionControls.motions.find(m=>m.data.id===hit.object.userData.motionId);
}

async function init() {
  [parameters, ...plans] = await Promise.all(['/house_parameters.json', '/plan_floor_1.json', '/plan_floor_2.json'].map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`无法读取 ${path}`);
    return response.json();
  }));
  $('#dimensions-note').textContent = `用户估计总宽约 ${parameters.site_width / 1000} 米；主体深 ${parameters.house_depth / 1000} 米、前院深 ${parameters.courtyard_depth / 1000} 米按含墙控制。外墙 ${parameters.exterior_wall_thickness / 10} 厘米、内墙 ${parameters.interior_wall_thickness / 10} 厘米、层高 ${parameters.floor_to_floor / 1000} 米暂定。共享隔墙按中心分摊。`;
  $('#screen-note').textContent = `新增影壁已取消。原有挡墙向院中移动，附属间门前净通道 ${parameters.annex_passage_clear_width / 1000} 米；楼梯朝院子的墙及窗已取消。`;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#e6ebe4');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '住宅三维视图，鼠标拖动旋转、滚轮缩放');
  viewport.prepend(renderer.domElement);
  camera = new THREE.OrthographicCamera(-15, 15, 15, -15, .1, 200);
  orbitCamera = camera;
  courtyardCamera = new THREE.PerspectiveCamera(62, 1, .08, 200);
  interiorCamera = new THREE.PerspectiveCamera(62, 1, .05, 200);
  walkCamera = new THREE.PerspectiveCamera(62,1,.05,200);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * .49;
  controls.minZoom = .35; controls.maxZoom = 6;
  controls.minDistance = .5; controls.maxDistance = 45;
  controls.listenToKeyEvents(renderer.domElement);
  controls.addEventListener('change', () => { needsRender = true; });
  skyLight = new THREE.HemisphereLight('#fffdf2', '#6f806e', 2.1);
  scene.add(skyLight);
  const light = new THREE.DirectionalLight('#fff9ec', 2.4);
  sunLight = light;
  light.position.set(-8, 25, 9); light.target.position.set(parameters.site_width / 2000, 0, -10);
  light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: .5, far: 90 });
  light.shadow.bias = -.0003; light.shadow.normalBias = .02;
  $('#render-quality').addEventListener('change',resize);
  scene.add(light, light.target);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ color: '#e6ebe4', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(parameters.site_width / 2000, -parameters.entrance_proposal.yard_drop_mm / 1000 - .22, -10); ground.receiveShadow = true; scene.add(ground);
  const gltf = await new GLTFLoader().loadAsync('/output/house.glb');
  scene.add(gltf.scene);
  gltf.scene.traverse(object=>{if(object.userData.gate_leaf)gateLeaves.push(object);});
  for (const plan of plans) {
    const root = gltf.scene.getObjectByName(`Floor_${plan.level}`);
    if (!root) throw new Error(`模型缺少第 ${plan.level} 层`);
    roots.set(plan.level, root);
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.2);
    cutPlanes.set(plan.level, clip);
    root.traverse(obj => {
      if (!obj.isMesh) return;
      obj.material = obj.material.clone();
      if (obj.userData.opening_kind === 'window') windowFrames.push(obj);
      obj.castShadow = true; obj.receiveShadow = true;
      if (['paving', 'pavingLight', 'gravel'].includes(obj.userData.garden_material)) obj.castShadow = false;
      if (obj.userData.glazing_proxy) {
        obj.castShadow = false;
        obj.material.depthWrite = false;
        obj.material.side = THREE.DoubleSide;
      }
      if (obj.userData.wall_id || obj.userData.is_proxy) {
        obj.material.clippingPlanes = [clip]; obj.material.clipShadows = true;
      }
      if(obj.userData.interior_kind) {
        obj.material.clippingPlanes=obj.userData.interior_kind==='finish'?[clip]:[];obj.material.clipShadows=true;
        if(obj.userData.interior_kind==='floor')obj.castShadow=false;
        if(obj.userData.interior_material==='glass'){obj.castShadow=false;obj.material.depthWrite=false;obj.material.side=THREE.DoubleSide;}
      }
      if (obj.userData.space_id) {
        // 房间色块略高于实体楼板，禁用其投影可避免两层近重合表面的阴影条纹。
        obj.castShadow = false;
        roomMeshes.set(`${plan.level}:${obj.userData.space_id}`, obj);
        obj.userData.baseColor = obj.material.color.clone();
        obj.material.polygonOffset = true; obj.material.polygonOffsetFactor = -1;
      }
    });
    for (const space of plan.spaces) {
      if (quietLabels.has(space.id)) continue;
      let x = space.polygon.reduce((n, p) => n + p[0], 0) / space.polygon.length;
      let y = space.polygon.reduce((n, p) => n + p[1], 0) / space.polygon.length;
      if (space.id === 'courtyard') { x = 5500; y = 3500; }
      if (space.id === 'stairwell') { x = plan.stairs.entry_x + 500; y = parameters.courtyard_depth + 3100; }
      const yardHeight = plan.level === 1 && ['courtyard', 'annex-south', 'annex-north'].includes(space.id) ? -parameters.entrance_proposal.yard_drop_mm / 1000 : 0;
      makeLabel(plan.level, space.label, coordinate(x, y, yardHeight + .06), space.id);
    }
    makeCutCaps(plan, root); makeCorrections(plan, root);
    const glazing = root.getObjectByName(`FacadeDetails_${plan.level}`) || root.getObjectByName(`FacadeGlazing_${plan.level}`);
    if (glazing) glazingGroups.push(glazing);
  }
  // 模型自带屋顶时直接使用；兼容此前导出的无屋顶模型。
  try {
    const roof = attachRoofConcept(THREE, roots.get(2), parameters);
    roofConcept = roof.group;
    rainwaterSystem = roots.get(1).getObjectByName('RainwaterSystem');
    $('#roof-note').textContent = `四坡灰瓦、实体檐口，南向出檐约 60 厘米。${rainwaterSystem ? '檐沟接两端雨水管，收向自家院内。' : ''}${roof.embedded ? '下载模型已同步。' : '当前为浏览器预览。'}结构、防水、排水能力与地下去向待复核。`;
    $('#roof-concept').disabled = false;
  } catch (error) {
    $('#roof-note').textContent = `屋顶概念未加载：${error.message} 原模型保持不变。`;
  }
  gardenDesign = roots.get(1).getObjectByName('CourtyardDesign');
  if (!gardenDesign) {
    gardenDesign = createCourtyardDesign(parameters, plans[0]);
    roots.get(1).add(gardenDesign);
    $('#garden-note').textContent = '当前为浏览器庭院预览，下载模型需要重建后同步。';
  }
  gardenDesign.traverse(object => {
    if (object.isMesh && object.material.name === 'garden/lamp') gardenEmitters.push(object.material);
  });
  for (const group of glazingGroups) {
    const emitters = [];
    group.traverse(object => {
      if (object.userData.facade_lamp) emitters.push(object);
      if (object.isMesh && object.material.name.startsWith('exterior/porch-light')) gardenEmitters.push(object.material);
    });
    for (const emitter of emitters) {
      const light = new THREE.SpotLight('#ffd6a1', 18, 5.5, Math.PI / 2.5, .7, 2);
      light.target.position.set(0, -1, .15);
      emitter.add(light, light.target); gardenLights.push(light);
    }
  }
  for (const [x, y, h] of courtyardLayout(parameters, plans[0]).lights) {
    const lamp = new THREE.PointLight('#ffd59b', 10, 4.5, 2);
    lamp.position.set(x, h + .05 + yardElevationAt(parameters,y), -y);
    roots.get(1).add(lamp); gardenLights.push(lamp);
  }
  solarControls=setupSolarControls({parameters,plans,state,scene,roots,skyLight,sunLight,renderer,ground,gardenLights,gardenEmitters,
    refresh:fit=>{updateView();if(fit){populateRooms();fitCamera();}},render:()=>{needsRender=true;}});
  let interiorsEmbedded=true;
  for(const plan of plans) {
    const layout=interiorLayout(parameters,plan);interiorLayouts.set(plan.level,layout);
    let group=roots.get(plan.level).getObjectByName(`InteriorDesign_${plan.level}`);
    if(!group){group=createInteriorDesign(parameters,plan);roots.get(plan.level).add(group);interiorsEmbedded=false;}
    group.traverse(obj=>{if(obj.isMesh){obj.material.clippingPlanes=obj.userData.interior_kind==='finish'?[cutPlanes.get(plan.level)]:[];obj.material.clipShadows=true;}});
    interiors.set(plan.level,group);
    let doors=roots.get(plan.level).getObjectByName(`DoorDesign_${plan.level}`);
    if(!doors){doors=createDoorDesign(parameters,plan);roots.get(plan.level).add(doors);}
    doorGroups.push(doors);
    const zones=createUseZones(layout);roots.get(plan.level).add(zones);interiorZones.set(plan.level,zones);
    const optgroup=document.createElement('optgroup');optgroup.label=`${plan.level}层`;
    for(const room of layout.rooms.filter(r=>layout.items.some(item=>item.space===r.id)))optgroup.append(new Option(room.label,`${plan.level}:${room.id}`));
    $('#interior-room-select').append(optgroup);
    for(const lamp of layout.lights) {
      const light=new THREE.PointLight('#fff1df',lamp.power,8,2);
      light.position.set(lamp.position[0],lamp.position[2]-.13,-lamp.position[1]);light.userData.roomKey=`${plan.level}:${lamp.space}`;
      roots.get(plan.level).add(light);interiorLights.push(light);
    }
  }
  const world=createWalkWorld(parameters,plans);
  const motions=collectMotions(roots);
  for(const m of motions){const room=plans[m.level-1].spaces.find(s=>s.id===m.node.userData.interior_room);if(room)m.data.label=`${room.label} · ${m.data.label}`;}
  motionControls=createMotionControls({motions,world,body:()=>walkControls?.position,changed:()=>{needsRender=true;}});
  walkControls=createWalkControls({canvas:renderer.domElement,camera:walkCamera,world,dynamic:()=>motionControls.obstacles().concat(gateObstacles(parameters,plans[0],state.gateOpen)),
    interact:()=>{const m=motionAt(new THREE.Vector2(0,0),2.7);if(m)motionControls.toggle(m);else $('#motion-note').textContent='请靠近门扇或柜门，将它放在画面中央再操作。';},
    changed:position=>{
      needsRender=true;
      const level=position.z>2.8?2:1;
      const room=interiorLayouts.get(level).rooms.find(r=>position.x>r.bounds[0]&&position.x<r.bounds[2]&&position.y>r.bounds[1]&&position.y<r.bounds[3]);
      for(const light of interiorLights)light.visible=light.userData.roomKey===`${level}:${room?.id}`;
    },exit:stopWalking});
  $('#walk-start').addEventListener('click',()=>{
    if(walkControls.active){stopWalking();return;}
    const [level,id]=state.roomView.split(':');
    const start=state.roomView?interiorViewpoint(parameters,plans.find(p=>p.level===Number(level)),id):null;
    motionControls.selectRoom(1,'');
    state.view='whole';state.cut=false;state.roof=true;state.garden=true;state.solar=false;state.daylight=false;state.suite=false;state.roomView='';state.useZones=false;state.interior=true;
    controls.enabled=false;camera=walkCamera;viewport.classList.add('walking');
    $('#walk-start').textContent='退出自由行走';walkControls.start(start);updateView();fitCamera();
  });
  // 切换展示视图时结束行走，避免另一套相机控制仍接收按键。
  const leaveOnViewChange=event=>{
    const el=event.target.closest('button,input,select');
    if(el&&el.id!=='walk-start'&&!['motion-toggle','motion-select','gate-toggle','labels'].includes(el.id))stopWalking();
  };
  $('.sidebar').addEventListener('click',leaveOnViewChange,true);
  $('.sidebar').addEventListener('change',leaveOnViewChange,true);
  for(const id of ['top-view','reset-view','compare','kitchen-window'])$('#'+id).addEventListener('click',stopWalking,true);
  $('#interior-note').textContent=interiorsEmbedded?'默认 A 已同步到下载模型，B 可切换比较配色。蓝色使用范围为方案预留；家具、饰面与设备选型仍待复核。':'室内方案正在浏览器中预览，下载模型需重建后同步。';
  const showInterior = room => {
    state.interior=true;state.roomView=room;state.solar=false;state.view=`floor${room.split(':')[0]}`;
    state.cut=false;state.roof=false;state.daylight=false;state.suite=false;state.top=false;
    updateView();populateRooms();selectRoom(room);fitCamera();
    const [level,id]=room.split(':');motionControls.selectRoom(Number(level),id);
  };
  const services=plans.flatMap(plan=>servicePoints(interiorLayouts.get(plan.level)).map(point=>({...point,level:plan.level,key:`${plan.level}:${point.id}`})));
  for(const point of services){const room=plans[point.level-1].spaces.find(s=>s.id===point.space);$('#service-select').append(new Option(`${point.level}层${room.label} · ${point.name}`,point.key));}
  serviceMarker=new THREE.Mesh(new THREE.SphereGeometry(.06,16,12),new THREE.MeshBasicMaterial({color:'#d68d37',depthTest:false}));
  serviceMarker.renderOrder=10;serviceMarker.visible=false;serviceMarker.userData.comparison_only=true;scene.add(serviceMarker);
  $('#service-select').addEventListener('change',event=>{
    const point=services.find(point=>point.key===event.target.value);
    if(!point){serviceMarker.visible=false;serviceMarker.userData.roomKey='';needsRender=true;return;}
    serviceMarker.position.set(point.position[0],point.position[2]+(point.level-1)*parameters.floor_to_floor/1000,-point.position[1]);
    serviceMarker.userData.roomKey=`${point.level}:${point.space}`;
    $('#service-note').textContent=`橙色点：${point.name}。${point.condition} 此点为方案候选位置，不能用于现场预埋。`;
    showInterior(serviceMarker.userData.roomKey);
  });
  $('#interior-preview').addEventListener('change',event=>{
    state.interior=event.target.checked;state.roomView='';state.solar=false;
    if(state.interior){state.view='floor1';state.cut=true;state.roof=false;}
    updateView();populateRooms();fitCamera();
  });
  document.querySelectorAll('[data-interior-style]').forEach(button=>button.addEventListener('click',()=>{
    state.interiorStyle=button.dataset.interiorStyle;
    for(const [level,group] of interiors)applyInteriorStyle(group,level,state.interiorStyle);
    showInterior(state.roomView||'1:hall');
  }));
  document.querySelectorAll('[data-interior-room]').forEach(button=>button.addEventListener('click',()=>showInterior(button.dataset.interiorRoom)));
  $('#interior-room-select').addEventListener('change',event=>{if(event.target.value)showInterior(event.target.value);});
  $('#interior-use-zones').addEventListener('change',event=>{
    state.useZones=event.target.checked;
    if(state.useZones){state.interior=true;state.solar=false;state.roomView='';state.cut=true;state.roof=false;state.top=true;if(!['floor1','floor2'].includes(state.view))state.view='floor1';}
    updateView();populateRooms();fitCamera();
  });
  $('#garden-design').addEventListener('change', event => {
    state.garden = event.target.checked;
    state.roomView='';
    if (state.garden && !['whole', 'courtyard'].includes(state.view)) state.view = 'whole';
    if (state.garden) { state.cut = false; state.roof = true; }
    updateView(); populateRooms(); fitCamera();
  });
  $('#gate-toggle').addEventListener('click',()=>{
    const person=walkControls.position;
    if(person&&gateObstacles(parameters,plans[0],!state.gateOpen).some(o=>touchesBody(o,person.x,person.y,person.z))){$('#motion-note').textContent='请先离开院门的停放位置再操作。';return;}
    state.gateOpen=!state.gateOpen;updateView();
  });
  document.querySelectorAll('[data-mood]').forEach(button => button.addEventListener('click', () => {
    state.solar=false;
    state.roomView='';
    state.mood = button.dataset.mood; state.garden = true; state.cut = false; state.roof = true;
    if (!['whole', 'courtyard'].includes(state.view)) state.view = 'whole';
    updateView(); populateRooms(); fitCamera();
  }));
  $('#roof-concept').addEventListener('click', () => {
    state.roomView='';
    state.roof = !roofIsVisible(state);
    if (state.roof) {
      state.view = 'whole'; state.cut = false; state.top = false;
      state.suite = false; state.daylight = false;
    }
    updateView(); populateRooms(); fitCamera();
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.roomView='';
    state.view = button.dataset.view;
    state.cut = !['whole', 'courtyard'].includes(state.view);
    state.roof = !state.cut;
    if (state.view === 'courtyard') state.garden = true;
    state.top = false; state.suite = false; state.daylight = false;
    updateView(); populateRooms(); fitCamera();
  }));
  $('#cutaway').addEventListener('change', event => { state.roomView='';state.cut = event.target.checked; if (state.cut) state.daylight = false; updateView(); fitCamera(); });
  $('#daylight').addEventListener('click', () => {
    state.roomView='';
    state.daylight = !state.daylight;
    if (state.daylight) { state.cut = false; state.top = false; state.suite = false; state.roof = false; }
    else state.cut = true;
    updateView(); fitCamera();
  });
  $('#labels').addEventListener('change', event => { state.labels = event.target.checked; needsRender = true; });
  $('#suite').addEventListener('click', () => {
    state.roomView='';
    state.suite = !state.suite;
    if (state.suite) {
      state.cut = true;
      state.daylight = false;
      if (['whole', 'courtyard'].includes(state.view)) { state.view = 'floor1'; populateRooms(); }
      selectRoom(`${visibleLevels()[0]}:master-bedroom`);
    }
    updateView(); fitCamera();
  });
  $('#room-select').addEventListener('change', event => selectRoom(event.target.value));
  $('#top-view').addEventListener('click', () => {
    state.roomView='';
    if (state.view === 'courtyard') { state.view = 'whole'; populateRooms(); }
    updateView();
    state.top = !state.top; fitCamera();
  });
  $('#reset-view').addEventListener('click', () => { state.top = false; fitCamera(); });
  $('#compare').addEventListener('click', () => {
    $('#drawing-floor').value = state.view === 'floor2' ? '2' : '1';
    updateDrawing(); $('#drawings').showModal();
  });
  $('#drawing-floor').addEventListener('change', updateDrawing);
  $('#close-drawings').addEventListener('click', () => $('#drawings').close());
  $('#kitchen-window').addEventListener('click', () => $('#kitchen-detail').showModal());
  $('#close-kitchen-detail').addEventListener('click', () => $('#kitchen-detail').close());
  let down;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (e.button !== 0 || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2);
    const motion=motionAt(pointer,walkControls.active?2.7:Infinity);
    if(motion){motionControls.toggle(motion);return;}
    if(roofConcept?.visible||walkControls.active)return;
    raycaster.setFromCamera(pointer, camera);
    const candidates = [...roomMeshes.entries()].filter(([key]) => visibleLevels().includes(Number(key.split(':')[0])));
    const hit = raycaster.intersectObjects(candidates.map(([, mesh]) => mesh), false)[0];
    if (hit) selectRoom(candidates.find(([, mesh]) => mesh === hit.object)[0]);
  });
  new ResizeObserver(resize).observe(viewport);
  populateRooms(); updateView(); resize(); fitCamera();
  $('#loading').hidden = true;
  viewport.dataset.ready = 'true';
  let previousTime=performance.now();
  renderer.setAnimationLoop(time => {
    const dt=Math.min((time-previousTime)/1000,.035);previousTime=time;
    const movingParts=motionControls.tick(dt),walking=walkControls.tick(dt);
    if(movingParts||walking)needsRender=true;
    if (!needsRender) return;
    renderer.render(scene, camera); positionLabels(); needsRender = false;
  });
}

init().catch(error => {
  console.error(error);
  $('#loading').textContent = `模型未能打开：${error.message}。请确认本地预览服务正在运行，然后刷新。`;
  viewport.dataset.ready = 'error';
});
