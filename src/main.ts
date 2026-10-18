import * as THREE from 'three';
import './style.css';

type Room = { id: string; name: string; x: number; y: number; w: number; h: number; color: number };
type Door = { key: string; axis: 'h' | 'v'; x: number; y: number };
type WallSegment = Door;
type Plan = { rooms: Room[]; doors: Door[]; selectedId: string | null };

const CELL = 1;
const STORAGE_KEY = 'esd-plan-v1';
const palette = [0xe8a779, 0x95b5a5, 0x9fadd0, 0xe1c36c, 0xd8969e, 0x81abb3];
const plan: Plan = { rooms: [], doors: [], selectedId: null };
let roomCounter = 0;
let toastTimer = 0;
const ROOM_SIZE = 5;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="ESD home"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>ESD</span></a>
      <div class="project-name"><span class="project-dot"></span><span>Untitled escape room</span><span class="saved-state" id="saved-state">Saved locally</span></div>
      <div class="top-actions"><button class="button button-quiet" id="load-button" title="Load your saved plan">↥ <span>Load</span></button><button class="button button-primary" id="save-button">Save plan <span class="save-icon">⌘ S</span></button></div>
    </header>
    <main class="workspace">
      <aside class="left-rail">
        <div class="rail-head"><span class="eyebrow">BUILD MODE</span><h1>Room layout</h1><p>Sketch the spaces your players will explore.</p></div>
        <div class="tool-card active"><span class="tool-icon">▦</span><span><strong>Rooms</strong><small>Draw floor plans</small></span><kbd>R</kbd></div>
        <div class="tool-divider"></div>
        <div class="section-label">YOUR ROOMS <span id="room-count">0</span></div>
        <div class="room-list" id="room-list"></div>
        <div class="empty-hint" id="empty-hint"><span class="hint-doodle">↗</span><strong>Start with a room</strong><span>Click the canvas to place a square room.</span></div>
        <div class="rail-bottom"><div class="tip-card"><span class="tip-star">✳</span><div><strong>Door tip</strong><p>Click a wall to add a door. Click the opening again to remove it.</p></div></div></div>
      </aside>
      <section class="editor">
        <div class="editor-toolbar"><div class="breadcrumb"><span>Escape room</span><span class="crumb-slash">/</span><strong>Floor plan</strong></div><div class="canvas-actions"><span class="canvas-hint"><span class="mouse-icon">⌖</span> Click empty space for a room · click a wall for a door</span><span class="action-divider"></span><button class="icon-button" id="zoom-out" aria-label="Zoom out">−</button><span class="zoom-value" id="zoom-value">100%</span><button class="icon-button" id="zoom-in" aria-label="Zoom in">+</button><button class="icon-button fit-button" id="fit-view" title="Fit rooms to view">⤢</button></div></div>
        <div class="canvas-wrap" id="canvas-wrap"><div class="canvas-label"><span class="live-dot"></span> TOP-DOWN VIEW <span class="canvas-label-divider">/</span> <span id="dimension-label">1 unit = 1m</span></div><div id="three-root"></div><div class="canvas-empty" id="canvas-empty"><div class="empty-graphic"><span class="empty-sq sq-back"></span><span class="empty-sq sq-front"></span><span class="empty-plus">+</span></div><strong>A blank canvas, full of possibility</strong><span>Click anywhere to place your first square room.</span><button class="button button-dark" id="first-room">Place a room <span>↗</span></button></div><div class="toast" id="toast"></div><div class="scale-note"><span class="scale-line"></span><span>1 m</span></div></div>
        <footer class="statusbar"><span><i class="status-dot"></i> Auto-save on</span><span id="status-message">Ready when you are</span><span class="status-shortcut"><kbd>Space</kbd> + drag to pan <span class="status-divider">·</span>scroll to zoom</span></footer>
      </section>
      <aside class="right-rail"><div class="panel-head"><div><span class="eyebrow">INSPECTOR</span><h2 id="inspector-title">Room details</h2></div><span class="inspector-glyph">⌗</span></div><div class="inspector-content" id="inspector-content"><div class="inspector-empty"><div class="select-illustration">↖</div><strong>Select a room</strong><span>Choose one on the canvas or in your room list to see its details.</span></div></div></aside>
    </main>
  </div>`;

const mount = document.querySelector<HTMLDivElement>('#three-root')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6f5f1');
const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 100);
let viewCenterX = 0;
let viewCenterZ = 0;
camera.position.set(0, 25, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(mount.clientWidth, mount.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.className = 'plan-canvas';
  renderer.domElement.setAttribute('aria-label', 'Top-down room layout canvas. Click to place a five meter square room.');
mount.appendChild(renderer.domElement);

const grid = new THREE.GridHelper(100, 100, 0xd8d8d2, 0xe4e3dd);
grid.rotation.x = 0;
grid.position.y = -0.02;
scene.add(grid);
const plane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0xf6f5f1 }));
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.04;
scene.add(plane);
scene.add(grid);

const roomLayer = new THREE.Group();
scene.add(roomLayer);
const doorLayer = new THREE.Group();
scene.add(doorLayer);
const previewGeometry = new THREE.PlaneGeometry(1, 1);
const preview = new THREE.Mesh(previewGeometry, new THREE.MeshBasicMaterial({ color: 0x526d64, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
preview.rotation.x = -Math.PI / 2;
preview.position.y = 0.015;
preview.visible = false;
scene.add(preview);
const doorHighlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), new THREE.MeshBasicMaterial({ color: 0x82a98e, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthTest: false }));
doorHighlight.rotation.x = -Math.PI / 2;
doorHighlight.position.y = 0.12;
doorHighlight.visible = false;
scene.add(doorHighlight);
let highlightedWallKey = '';
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let spaceHeld = false;
let panState: { pointerId: number; startX: number; startY: number; centerX: number; centerZ: number } | null = null;

function resize(): void {
  const width = mount.clientWidth || 1;
  const height = mount.clientHeight || 1;
  const aspect = width / height;
  const halfH = 8;
  camera.left = -halfH * aspect; camera.right = halfH * aspect;
  camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  render();
}

function render(): void { renderer.render(scene, camera); }

function wallSegments(): WallSegment[] {
  const segments = new Map<string, WallSegment>();
  const addHorizontal = (x: number, y: number): void => { const key = `h:${x}:${y}`; segments.set(key, { key, axis: 'h', x, y }); };
  const addVertical = (x: number, y: number): void => { const key = `v:${x}:${y}`; segments.set(key, { key, axis: 'v', x, y }); };
  for (const room of plan.rooms) {
    for (let i = 0; i < room.w; i++) { addHorizontal(room.x + i, room.y); addHorizontal(room.x + i, room.y + room.h); }
    for (let i = 0; i < room.h; i++) { addVertical(room.x, room.y + i); addVertical(room.x + room.w, room.y + i); }
  }
  return [...segments.values()];
}

function wallDistance(point: { x: number; z: number }, segment: WallSegment): number {
  if (segment.axis === 'h') return Math.hypot(Math.max(segment.x - point.x, 0, point.x - segment.x - 1), point.z - segment.y);
  return Math.hypot(point.x - segment.x, Math.max(segment.y - point.z, 0, point.z - segment.y - 1));
}

function nearestWall(point: { x: number; z: number }): WallSegment | null {
  let closest: WallSegment | null = null;
  let distance = 0.34;
  for (const segment of wallSegments()) {
    const candidate = wallDistance(point, segment);
    if (candidate <= distance) { closest = segment; distance = candidate; }
  }
  return closest;
}

function highlightWall(segment: WallSegment | null): void {
  if (!segment) { doorHighlight.visible = false; highlightedWallKey = ''; render(); return; }
  if (highlightedWallKey !== segment.key) {
    doorHighlight.geometry.dispose();
    doorHighlight.geometry = segment.axis === 'h' ? new THREE.PlaneGeometry(1, 0.2) : new THREE.PlaneGeometry(0.2, 1);
    highlightedWallKey = segment.key;
  }
  const hasDoor = plan.doors.some(door => door.key === segment.key);
  (doorHighlight.material as THREE.MeshBasicMaterial).color.set(hasDoor ? 0xd89579 : 0x82a98e);
  doorHighlight.position.set(segment.axis === 'h' ? segment.x + 0.5 : segment.x, 0.12, segment.axis === 'h' ? segment.y : segment.y + 0.5);
  doorHighlight.visible = true;
  render();
}

function rebuildScene(): void {
  roomLayer.clear();
  doorLayer.clear();
  plan.rooms.forEach((room, index) => {
    const color = new THREE.Color(room.color);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(room.x + room.w / 2, 0, room.y + room.h / 2); floor.userData.roomId = room.id;
    roomLayer.add(floor);
    const label = makeLabel(room.name || `Room ${index + 1}`, room.id === plan.selectedId);
    label.position.set(room.x + room.w / 2, 0.06, room.y + room.h / 2);
    roomLayer.add(label);
    const sizeLabel = makeLabel(`${room.w} × ${room.h} m`, false, true);
    sizeLabel.position.set(room.x + room.w / 2, 0.06, room.y + room.h / 2 + 0.46);
    roomLayer.add(sizeLabel);
  });
  const doorKeys = new Set(plan.doors.map(door => door.key));
  const wallPoints: THREE.Vector3[] = [];
  const doorPoints: THREE.Vector3[] = [];
  const doorArcPoints: THREE.Vector3[] = [];
  for (const segment of wallSegments()) {
    if (!doorKeys.has(segment.key)) {
      if (segment.axis === 'h') wallPoints.push(new THREE.Vector3(segment.x, 0.045, segment.y), new THREE.Vector3(segment.x + 1, 0.045, segment.y));
      else wallPoints.push(new THREE.Vector3(segment.x, 0.045, segment.y), new THREE.Vector3(segment.x, 0.045, segment.y + 1));
      continue;
    }
    const pivotX = segment.axis === 'h' ? segment.x + 0.12 : segment.x;
    const pivotZ = segment.axis === 'h' ? segment.y : segment.y + 0.12;
    const radius = 0.78;
    const openX = segment.axis === 'h' ? pivotX : pivotX + radius;
    const openZ = segment.axis === 'h' ? pivotZ + radius : pivotZ;
    doorPoints.push(new THREE.Vector3(pivotX, 0.065, pivotZ), new THREE.Vector3(openX, 0.065, openZ));
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI / 2, b = ((i + 1) / steps) * Math.PI / 2;
      const ax = segment.axis === 'h' ? pivotX + Math.cos(a) * radius : pivotX + Math.sin(a) * radius;
      const az = segment.axis === 'h' ? pivotZ + Math.sin(a) * radius : pivotZ + Math.cos(a) * radius;
      const bx = segment.axis === 'h' ? pivotX + Math.cos(b) * radius : pivotX + Math.sin(b) * radius;
      const bz = segment.axis === 'h' ? pivotZ + Math.sin(b) * radius : pivotZ + Math.cos(b) * radius;
      doorArcPoints.push(new THREE.Vector3(ax, 0.064, az), new THREE.Vector3(bx, 0.064, bz));
    }
  }
  if (wallPoints.length) {
    const walls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wallPoints), new THREE.LineBasicMaterial({ color: 0x343c36 }));
    walls.position.y = 0.035;
    roomLayer.add(walls);
  }
  if (doorPoints.length) doorLayer.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(doorPoints), new THREE.LineBasicMaterial({ color: 0xa56f4e })));
  if (doorArcPoints.length) doorLayer.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(doorArcPoints), new THREE.LineBasicMaterial({ color: 0xb78a68, transparent: true, opacity: 0.8 })));
  document.querySelector('#canvas-empty')!.classList.toggle('hidden', plan.rooms.length > 0);
  render();
}

function makeLabel(text: string, selected: boolean, subtle = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `${subtle ? 400 : selected ? 700 : 600} ${subtle ? 25 : 31}px Inter, ui-sans-serif, sans-serif`;
  context.fillStyle = subtle ? '#636b64' : '#27332e';
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 48, 480);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(subtle ? 1.5 : Math.max(1.7, Math.min(3.4, text.length * 0.095)), subtle ? 0.27 : 0.38, 1);
  return sprite;
}

function screenToWorld(event: Pick<MouseEvent, 'clientX' | 'clientY'>): { x: number; y: number; worldX: number; worldZ: number } | null {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
  return { x: Math.floor(hit.x / CELL), y: Math.floor(hit.z / CELL), worldX: hit.x, worldZ: hit.z };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: Room): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function touchesRoom(candidate: { x: number; y: number; w: number; h: number }, room: Room): boolean {
  const horizontalOverlap = Math.max(candidate.x, room.x) < Math.min(candidate.x + candidate.w, room.x + room.w);
  const verticalOverlap = Math.max(candidate.y, room.y) < Math.min(candidate.y + candidate.h, room.y + room.h);
  return (horizontalOverlap && (candidate.y + candidate.h === room.y || room.y + room.h === candidate.y)) || (verticalOverlap && (candidate.x + candidate.w === room.x || room.x + room.w === candidate.x));
}

function placeRoom(rect: { x: number; y: number; w: number; h: number }): void {
  if (plan.rooms.some(room => overlaps(rect, room))) { showToast('Rooms can’t overlap. Try another spot.'); return; }
  if (plan.rooms.length > 0 && !plan.rooms.some(room => touchesRoom(rect, room))) { showToast('Place the room against an existing room to connect it.'); return; }
  roomCounter++;
  const room: Room = { ...rect, id: crypto.randomUUID(), name: `Room ${roomCounter}`, color: palette[(roomCounter - 1) % palette.length]! };
  plan.rooms.push(room); plan.selectedId = room.id;
  markChanged(); updateUI();
  showToast(`${room.name} added`);
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 1 && !(event.button === 0 && spaceHeld)) return;
  event.preventDefault();
  panState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, centerX: viewCenterX, centerZ: viewCenterZ };
  preview.visible = false;
  highlightWall(null);
  renderer.domElement.style.cursor = 'grabbing';
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (panState?.pointerId === event.pointerId) {
    const rect = renderer.domElement.getBoundingClientRect();
    const viewWidth = (camera.right - camera.left) / camera.zoom;
    const viewHeight = (camera.top - camera.bottom) / camera.zoom;
    viewCenterX = panState.centerX - ((event.clientX - panState.startX) / rect.width) * viewWidth;
    viewCenterZ = panState.centerZ + ((event.clientY - panState.startY) / rect.height) * viewHeight;
    camera.position.set(viewCenterX, 25, viewCenterZ);
    camera.lookAt(viewCenterX, 0, viewCenterZ);
    render();
    return;
  }
  const cell = screenToWorld(event); if (!cell) return;
  const wall = nearestWall({ x: cell.worldX, z: cell.worldZ });
  if (wall) {
    highlightWall(wall);
    renderer.domElement.style.cursor = 'pointer';
    preview.visible = false;
    return;
  }
  highlightWall(null);
  const intersections = raycaster.intersectObjects(roomLayer.children.filter(obj => obj instanceof THREE.Mesh), false);
  renderer.domElement.style.cursor = intersections.length ? 'pointer' : 'copy';
  if (intersections.length) { preview.visible = false; render(); }
  else updatePreview(cell);
});
renderer.domElement.addEventListener('pointerup', event => {
  if (panState?.pointerId === event.pointerId) {
    panState = null;
    renderer.domElement.style.cursor = spaceHeld ? 'grab' : '';
    return;
  }
  if (event.button !== 0) return;
  const cell = screenToWorld(event); if (!cell) return;
  const wall = nearestWall({ x: cell.worldX, z: cell.worldZ });
  if (wall) {
    const existing = plan.doors.findIndex(door => door.key === wall.key);
    if (existing >= 0) { plan.doors.splice(existing, 1); showToast('Door removed'); }
    else { plan.doors.push({ ...wall }); showToast('Door added'); }
    markChanged(); rebuildScene(); highlightWall(wall);
    return;
  }
  const intersections = raycaster.intersectObjects(roomLayer.children.filter(obj => obj instanceof THREE.Mesh), false);
  const roomId = intersections[0]?.object.userData.roomId as string | undefined;
  if (roomId) { plan.selectedId = roomId; updateUI(); rebuildScene(); return; }
  preview.visible = false;
  placeRoom({ x: cell.x - Math.floor(ROOM_SIZE / 2), y: cell.y - Math.floor(ROOM_SIZE / 2), w: ROOM_SIZE, h: ROOM_SIZE });
});
renderer.domElement.addEventListener('pointercancel', event => { if (panState?.pointerId === event.pointerId) panState = null; });
renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  const before = screenToWorld(event);
  if (!before) return;
  zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  const after = screenToWorld(event);
  if (!after) return;
  viewCenterX += before.worldX - after.worldX;
  viewCenterZ += before.worldZ - after.worldZ;
  camera.position.set(viewCenterX, 25, viewCenterZ);
  camera.lookAt(viewCenterX, 0, viewCenterZ);
  render();
}, { passive: false });
renderer.domElement.addEventListener('pointerleave', () => { preview.visible = false; highlightWall(null); });
function updatePreview(cell: { x: number; y: number }): void {
  const rect = { x: cell.x - Math.floor(ROOM_SIZE / 2), y: cell.y - Math.floor(ROOM_SIZE / 2), w: ROOM_SIZE, h: ROOM_SIZE };
  preview.position.set(rect.x + rect.w / 2, 0.015, rect.y + rect.h / 2);
  preview.scale.set(rect.w, rect.h, 1);
  preview.material.color.set(plan.rooms.length && !plan.rooms.some(r => touchesRoom(rect, r)) ? 0xd27862 : 0x526d64);
  preview.visible = true; render();
}

function updateUI(): void {
  const list = document.querySelector<HTMLDivElement>('#room-list')!;
  document.querySelector('#room-count')!.textContent = String(plan.rooms.length);
  document.querySelector('#empty-hint')!.classList.toggle('hidden', plan.rooms.length > 0);
  list.innerHTML = '';
  plan.rooms.forEach((room, index) => {
    const row = document.createElement('button');
    row.className = `room-row ${room.id === plan.selectedId ? 'selected' : ''}`;
    row.innerHTML = `<span class="room-swatch" style="--room-color:#${room.color.toString(16).padStart(6, '0')}"></span><span class="room-row-copy"><strong></strong><small>${room.w} × ${room.h} m</small></span><span class="row-index">${String(index + 1).padStart(2, '0')}</span>`;
    row.querySelector('strong')!.textContent = room.name;
    row.addEventListener('click', () => { plan.selectedId = room.id; updateUI(); rebuildScene(); });
    list.appendChild(row);
  });
  const selected = plan.rooms.find(room => room.id === plan.selectedId);
  document.querySelector('#inspector-title')!.textContent = selected ? 'Room details' : 'Room details';
  const content = document.querySelector<HTMLDivElement>('#inspector-content')!;
  if (!selected) {
    content.innerHTML = '<div class="inspector-empty"><div class="select-illustration">↖</div><strong>Select a room</strong><span>Choose one on the canvas or in your room list to see its details.</span></div>';
  } else {
    content.innerHTML = `<label class="field-label" for="room-name">ROOM NAME</label><input class="text-input" id="room-name" maxlength="28" value="" /><div class="field-group"><span class="field-label">FOOTPRINT</span><div class="dimensions"><div class="dimension"><strong>${selected.w}</strong><span>m wide</span></div><span class="dimension-x">×</span><div class="dimension"><strong>${selected.h}</strong><span>m deep</span></div></div></div><div class="field-group"><span class="field-label">POSITION</span><div class="position-row"><span>X <strong>${selected.x}</strong></span><span>Y <strong>${selected.y}</strong></span></div></div><div class="field-group"><span class="field-label">ROOM COLOR</span><div class="swatch-picker">${palette.map((color, index) => `<button class="color-swatch ${color === selected.color ? 'chosen' : ''}" data-color="${color}" style="--room-color:#${color.toString(16).padStart(6, '0')}" aria-label="Color ${index + 1}"></button>`).join('')}</div></div><button class="delete-button" id="delete-room"><span>⌫</span> Delete room</button>`;
    const input = content.querySelector<HTMLInputElement>('#room-name')!;
    input.value = selected.name;
    input.addEventListener('input', () => { selected.name = input.value; rebuildScene(); updateRoomListOnly(); markChanged(); });
    content.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach(button => button.addEventListener('click', () => { selected.color = Number(button.dataset.color); updateUI(); rebuildScene(); markChanged(); }));
    content.querySelector('#delete-room')!.addEventListener('click', () => { const at = plan.rooms.findIndex(r => r.id === selected.id); plan.rooms.splice(at, 1); const validWallKeys = new Set(wallSegments().map(wall => wall.key)); plan.doors = plan.doors.filter(door => validWallKeys.has(door.key)); plan.selectedId = plan.rooms[Math.max(0, at - 1)]?.id ?? null; markChanged(); updateUI(); rebuildScene(); });
  }
  rebuildScene();
}

function updateRoomListOnly(): void {
  const row = [...document.querySelectorAll<HTMLButtonElement>('.room-row')].find(button => button.classList.contains('selected'));
  if (row) row.querySelector('strong')!.textContent = plan.rooms.find(r => r.id === plan.selectedId)?.name ?? '';
}

function fitView(): void {
  camera.zoom = 1;
  document.querySelector('#zoom-value')!.textContent = '100%';
  if (!plan.rooms.length) { viewCenterX = 0; viewCenterZ = 0; camera.position.set(0, 25, 0); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); render(); return; }
  const minX = Math.min(...plan.rooms.map(r => r.x)), minY = Math.min(...plan.rooms.map(r => r.y));
  const maxX = Math.max(...plan.rooms.map(r => r.x + r.w)), maxY = Math.max(...plan.rooms.map(r => r.y + r.h));
  viewCenterX = (minX + maxX) / 2;
  viewCenterZ = (minY + maxY) / 2;
  camera.position.set(viewCenterX, 25, viewCenterZ);
  camera.lookAt(viewCenterX, 0, viewCenterZ);
  const width = mount.clientWidth || 1, height = mount.clientHeight || 1;
  const halfHeight = Math.max(8, (maxY - minY) * 0.72, (maxX - minX) / (width / height) * 0.72);
  camera.top = halfHeight; camera.bottom = -halfHeight;
  camera.left = -halfHeight * width / height; camera.right = halfHeight * width / height;
  camera.updateProjectionMatrix(); render();
}

function zoom(factor: number): void { camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.45, 3); camera.updateProjectionMatrix(); render(); document.querySelector('#zoom-value')!.textContent = `${Math.round(camera.zoom * 100)}%`; }
function markChanged(): void { document.querySelector('#saved-state')!.textContent = 'Unsaved changes'; document.querySelector('#status-message')!.textContent = 'Plan updated'; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(savePlan, 900); }
function savePlan(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rooms: plan.rooms, doors: plan.doors, selectedId: plan.selectedId, roomCounter })); document.querySelector('#saved-state')!.textContent = 'Saved locally'; document.querySelector('#status-message')!.textContent = 'Saved in this browser'; }
function loadPlan(): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { showToast('No saved plan in this browser yet.'); return; }
  try { const data = JSON.parse(raw) as Partial<Plan> & { roomCounter?: number }; if (!Array.isArray(data.rooms)) throw new Error('Invalid plan'); plan.rooms = data.rooms; plan.doors = Array.isArray(data.doors) ? data.doors : []; plan.selectedId = data.selectedId ?? null; roomCounter = data.roomCounter ?? plan.rooms.length; updateUI(); fitView(); showToast('Your saved plan is ready.'); }
  catch { showToast('That saved plan couldn’t be opened.'); }
}
function showToast(message: string): void { const toast = document.querySelector<HTMLDivElement>('#toast')!; toast.textContent = message; toast.classList.add('visible'); window.setTimeout(() => toast.classList.remove('visible'), 2200); }

document.querySelector('#save-button')!.addEventListener('click', savePlan);
document.querySelector('#load-button')!.addEventListener('click', loadPlan);
document.querySelector('#zoom-in')!.addEventListener('click', () => zoom(1.18));
document.querySelector('#zoom-out')!.addEventListener('click', () => zoom(1 / 1.18));
document.querySelector('#fit-view')!.addEventListener('click', fitView);
document.querySelector('#first-room')!.addEventListener('click', () => showToast('Click an empty spot on the canvas to place a 5 × 5 m room.'));
window.addEventListener('keydown', event => {
  const target = event.target;
  const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if (event.code === 'Space' && !typing) { spaceHeld = true; renderer.domElement.style.cursor = 'grab'; event.preventDefault(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); savePlan(); }
});
window.addEventListener('keyup', event => { if (event.code === 'Space') { spaceHeld = false; renderer.domElement.style.cursor = ''; } });
window.addEventListener('blur', () => { spaceHeld = false; panState = null; renderer.domElement.style.cursor = ''; });
window.addEventListener('resize', resize);
resize(); updateUI(); loadPlan();
