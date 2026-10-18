import * as THREE from 'three';
import './style.css';

type Room = { id: string; name: string; x: number; y: number; w: number; h: number; color: number };
type Door = { key: string; axis: 'h' | 'v'; x: number; y: number };
type StartPoint = { x: number; z: number; roomId: string };
type WallSegment = Door;
type FurnitureKind = 'table-1x1' | 'table-2x1' | 'poster';
type FurnitureItem = { id: string; kind: FurnitureKind; x: number; z: number; rotation: 0 | 1; roomId: string; wall?: WallSegment };
type Plan = { rooms: Room[]; doors: Door[]; start: StartPoint | null; furniture: FurnitureItem[]; selectedId: string | null };
type AppMode = 'build' | 'explore';

const CELL = 1;
const STORAGE_KEY = 'esd-plan-v1';
const palette = [0xe8a779, 0x95b5a5, 0x9fadd0, 0xe1c36c, 0xd8969e, 0x81abb3];
const plan: Plan = { rooms: [], doors: [], start: null, furniture: [], selectedId: null };
let roomCounter = 0;
let toastTimer = 0;
const ROOM_SIZE = 5;
const WALL_HEIGHT = 3;
const DOOR_HEIGHT = 2.1;
const PLAYER_RADIUS = 0.22;
const PLAYER_SPEED = 3.5;
const PLAYER_EYE_HEIGHT = 1.65;
const TABLE_HEIGHT = PLAYER_EYE_HEIGHT / 2;
let activeMode: AppMode = 'build';
let activeTool: 'rooms' | 'start' | 'furniture' | 'remove' = 'rooms';
let exploreRemoveMode = false;
let selectedFurnitureKind: FurnitureKind = 'table-1x1';
let furnitureRotation: 0 | 1 = 0;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="ESD home"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>ESD</span></a>
      <div class="project-name"><span class="project-dot"></span><span>Untitled escape room</span><span class="saved-state" id="saved-state">Saved locally</span></div>
      <nav class="mode-tabs" aria-label="Editor mode"><button class="mode-tab active" id="build-tab">Build</button><button class="mode-tab" id="explore-tab">Explore</button></nav>
      <div class="top-actions"><button class="button button-quiet" id="load-button" title="Load your saved plan">↥ <span>Load</span></button><button class="button button-primary" id="save-button">Save plan <span class="save-icon">⌘ S</span></button></div>
    </header>
    <main class="workspace">
      <aside class="left-rail">
        <div class="rail-head"><span class="eyebrow">BUILD MODE</span><h1>Room layout</h1><p>Sketch the spaces your players will explore.</p></div>
        <button class="tool-card active" id="rooms-tool"><span class="tool-icon">▦</span><span><strong>Rooms</strong><small>Click to add a room</small></span><kbd>R</kbd></button>
        <button class="tool-card" id="start-tool"><span class="tool-icon start-tool-icon">◎</span><span><strong>Start marker</strong><small>Choose player start</small></span></button>
        <button class="tool-card" id="furniture-tool"><span class="tool-icon">▤</span><span><strong>Furniture</strong><small>Tables and wall posters</small></span></button>
        <button class="tool-card" id="remove-furniture-tool"><span class="tool-icon">⌫</span><span><strong>Remove furniture</strong><small>Click placed furniture</small></span></button>
        <div class="furniture-picker hidden" id="furniture-picker"><span class="field-label">CHOOSE FURNITURE</span><button class="furniture-choice active" data-furniture="table-1x1"><span class="furniture-sample table-sample small-table"></span><span><strong>1 × 1 table</strong><small>Floor · 1 × 1 m</small></span></button><button class="furniture-choice" data-furniture="table-2x1"><span class="furniture-sample table-sample wide-table"></span><span><strong>2 × 1 table</strong><small>Floor · 2 × 1 m</small></span></button><button class="furniture-choice" data-furniture="poster"><span class="furniture-sample poster-sample">▧</span><span><strong>Poster</strong><small>Wall · full wall panel</small></span></button><button class="rotate-button hidden" id="rotate-furniture">↻ Rotate table</button></div>
        <div class="tool-divider"></div>
        <div class="section-label">YOUR ROOMS <span id="room-count">0</span></div>
        <div class="room-list" id="room-list"></div>
        <div class="section-label furniture-list-heading">PLACED FURNITURE <span id="furniture-count">0</span></div>
        <div class="furniture-list" id="furniture-list"></div>
        <div class="empty-hint" id="empty-hint"><span class="hint-doodle">↗</span><strong>Start with a room</strong><span>Click the canvas to place a square room.</span></div>
        <div class="rail-bottom"><div class="tip-card"><span class="tip-star">✳</span><div><strong>Door tip</strong><p>Click a wall to add a door. Click the opening again to remove it.</p></div></div></div>
      </aside>
      <section class="editor">
        <div class="editor-toolbar"><div class="breadcrumb"><span id="breadcrumb-root">Escape room</span><span class="crumb-slash">/</span><strong id="breadcrumb-view">Floor plan</strong></div><div class="canvas-actions"><span class="canvas-hint" id="canvas-hint"><span class="mouse-icon">⌖</span> Click empty space for a room · click a wall for a door</span><span class="action-divider"></span><button class="icon-button" id="zoom-out" aria-label="Zoom out">−</button><span class="zoom-value" id="zoom-value">100%</span><button class="icon-button" id="zoom-in" aria-label="Zoom in">+</button><button class="icon-button fit-button" id="fit-view" title="Fit rooms to view">⤢</button></div></div>
        <div class="canvas-wrap" id="canvas-wrap"><div class="canvas-label"><span class="live-dot"></span><span id="canvas-label-text">TOP-DOWN VIEW</span><span class="canvas-label-divider">/</span><span id="dimension-label">1 unit = 1m</span></div><div id="three-root"></div><div class="canvas-empty" id="canvas-empty"><div class="empty-graphic"><span class="empty-sq sq-back"></span><span class="empty-sq sq-front"></span><span class="empty-plus">+</span></div><strong>A blank canvas, full of possibility</strong><span>Click anywhere to place your first square room.</span><button class="button button-dark" id="first-room">Place a room <span>↗</span></button></div><div class="explore-overlay hidden" id="explore-overlay"><button class="explore-exit" id="explore-exit">↩ Build <kbd>B</kbd></button><div class="explore-message" id="explore-message">Click to look around</div><div class="explore-selection" id="explore-selection"><span>SCROLL TO SELECT</span><strong id="explore-item-name">1 × 1 table</strong><small id="explore-selection-hint">Click to place</small></div><div class="crosshair" id="crosshair"><i></i><i></i></div><div class="explore-controls"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move <span>·</span> Mouse Look <span>·</span> Scroll to select <span>·</span> Click to place or remove <span>·</span> Esc unlock <span>·</span> B Build</div></div><div class="toast" id="toast"></div><div class="scale-note"><span class="scale-line"></span><span>1 m</span></div></div>
        <footer class="statusbar"><span><i class="status-dot"></i> Auto-save on</span><span id="status-message">Ready when you are</span><span class="status-shortcut"><kbd>Space</kbd> + drag to pan <span class="status-divider">·</span>scroll to zoom</span></footer>
      </section>
      <aside class="right-rail"><div class="panel-head"><div><span class="eyebrow">INSPECTOR</span><h2 id="inspector-title">Room details</h2></div><span class="inspector-glyph">⌗</span></div><div class="inspector-content" id="inspector-content"><div class="inspector-empty"><div class="select-illustration">↖</div><strong>Select a room</strong><span>Choose one on the canvas or in your room list to see its details.</span></div></div></aside>
    </main>
  </div>`;

const mount = document.querySelector<HTMLDivElement>('#three-root')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f6f5f1');
const exploreScene = new THREE.Scene();
exploreScene.background = new THREE.Color('#cbd2ce');
const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 100);
let viewCenterX = 0;
let viewCenterZ = 0;
camera.position.set(0, 25, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
const playerCamera = new THREE.PerspectiveCamera(75, 1, 0.05, 250);
playerCamera.rotation.order = 'YXZ';
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
const furnitureLayer = new THREE.Group();
scene.add(furnitureLayer);
const previewGeometry = new THREE.PlaneGeometry(1, 1);
const preview = new THREE.Mesh(previewGeometry, new THREE.MeshBasicMaterial({ color: 0x526d64, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
preview.rotation.x = -Math.PI / 2;
preview.position.y = 0.015;
preview.visible = false;
scene.add(preview);
const furniturePreview = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x9f7655, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthTest: false }));
furniturePreview.rotation.x = -Math.PI / 2;
furniturePreview.visible = false;
scene.add(furniturePreview);
let furniturePreviewShape = '1x1';
const doorHighlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), new THREE.MeshBasicMaterial({ color: 0x82a98e, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthTest: false }));
doorHighlight.rotation.x = -Math.PI / 2;
doorHighlight.position.y = 0.12;
doorHighlight.visible = false;
scene.add(doorHighlight);
let highlightedWallKey = '';
const startMarker = new THREE.Group();
const markerRing = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.34, 28), new THREE.MeshBasicMaterial({ color: 0x377b57, side: THREE.DoubleSide }));
markerRing.rotation.x = -Math.PI / 2;
markerRing.position.y = 0.13;
startMarker.add(markerRing);
const markerArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.14, 0), 0.72, 0x377b57, 0.2, 0.15);
startMarker.add(markerArrow);
const markerLabel = makeLabel('START', true, true);
markerLabel.position.set(0, 0.15, -0.52);
markerLabel.scale.set(0.75, 0.18, 1);
startMarker.add(markerLabel);
startMarker.visible = false;
scene.add(startMarker);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let spaceHeld = false;
let panState: { pointerId: number; startX: number; startY: number; centerX: number; centerZ: number } | null = null;
const pressedKeys = new Set<string>();
let playerPosition = new THREE.Vector3();
let playerYaw = 0;
let playerPitch = 0;
let animationFrame = 0;
let previousFrameTime = 0;

const ambient = new THREE.HemisphereLight(0xffffff, 0x686f68, 2.1);
exploreScene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(-8, 14, 7);
exploreScene.add(sun);
const exploreWorld = new THREE.Group();
exploreScene.add(exploreWorld);
const exploreGhost = new THREE.Group();
exploreScene.add(exploreGhost);
let exploreGhostKey = '';
const exploreSurfaces: THREE.Object3D[] = [];
const posterTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 192; canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#d6b77d'; context.fillRect(0, 0, 192, 256);
  context.fillStyle = '#425a62'; context.fillRect(16, 16, 160, 224);
  context.fillStyle = '#e6d8b6'; context.beginPath(); context.arc(96, 98, 48, Math.PI, 0); context.lineTo(144, 172); context.lineTo(48, 172); context.closePath(); context.fill();
  context.fillStyle = '#bb7852'; context.beginPath(); context.arc(96, 94, 24, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#d6b77d'; context.fillRect(52, 190, 88, 7); context.fillRect(68, 207, 56, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();

function resize(): void {
  const width = mount.clientWidth || 1;
  const height = mount.clientHeight || 1;
  const aspect = width / height;
  const halfH = 8;
  camera.left = -halfH * aspect; camera.right = halfH * aspect;
  camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  playerCamera.aspect = aspect;
  playerCamera.updateProjectionMatrix();
  renderer.setSize(width, height);
  alignCrosshair();
  render();
}

function render(): void {
  if (activeMode === 'explore') renderer.render(exploreScene, playerCamera);
  else renderer.render(scene, camera);
}

function alignCrosshair(): void {
  const canvasRect = renderer.domElement.getBoundingClientRect();
  const wrapRect = document.querySelector('#canvas-wrap')!.getBoundingClientRect();
  const crosshair = document.querySelector<HTMLDivElement>('#crosshair')!;
  crosshair.style.left = `${canvasRect.left - wrapRect.left + canvasRect.width / 2}px`;
  crosshair.style.top = `${canvasRect.top - wrapRect.top + canvasRect.height / 2}px`;
}

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

function tableDimensions(kind: FurnitureKind, rotation: 0 | 1): { w: number; h: number } {
  if (kind === 'table-2x1') return rotation === 0 ? { w: 2, h: 1 } : { w: 1, h: 2 };
  return { w: 1, h: 1 };
}

function furnitureLabel(kind: FurnitureKind): string {
  if (kind === 'table-1x1') return '1 × 1 table';
  if (kind === 'table-2x1') return '2 × 1 table';
  return 'Poster';
}

function containingRoom(x: number, z: number, w: number, h: number): Room | undefined {
  return plan.rooms.find(room => x >= room.x && z >= room.y && x + w <= room.x + room.w && z + h <= room.y + room.h);
}

function canPlaceTable(x: number, z: number, kind: FurnitureKind, rotation: 0 | 1): boolean {
  const size = tableDimensions(kind, rotation);
  if (!containingRoom(x, z, size.w, size.h)) return false;
  if (plan.furniture.some(item => {
    if (item.kind === 'poster') return false;
    const other = tableDimensions(item.kind, item.rotation);
    return x < item.x + other.w && x + size.w > item.x && z < item.z + other.h && z + size.h > item.z;
  })) return false;
  const spawnRoom = plan.rooms.find(room => room.id === plan.start?.roomId) ?? plan.rooms[0];
  if (spawnRoom) {
    const spawnX = plan.start?.x ?? spawnRoom.x + spawnRoom.w / 2;
    const spawnZ = plan.start?.z ?? spawnRoom.y + spawnRoom.h / 2;
    if (spawnX + PLAYER_RADIUS > x && spawnX - PLAYER_RADIUS < x + size.w && spawnZ + PLAYER_RADIUS > z && spawnZ - PLAYER_RADIUS < z + size.h) return false;
  }
  if (activeMode === 'explore' && playerPosition.x + PLAYER_RADIUS > x && playerPosition.x - PLAYER_RADIUS < x + size.w && playerPosition.z + PLAYER_RADIUS > z && playerPosition.z - PLAYER_RADIUS < z + size.h) return false;
  return true;
}

function addFurniture(item: FurnitureItem): void {
  plan.furniture.push(item);
  markChanged();
  updateUI();
  rebuildScene();
  if (activeMode === 'explore') rebuildExploreScene();
  render();
  showToast(`${furnitureLabel(item.kind)} placed`);
}

function removeFurniture(id: string): void {
  const item = plan.furniture.find(furniture => furniture.id === id);
  if (!item) return;
  plan.furniture = plan.furniture.filter(furniture => furniture.id !== id);
  markChanged();
  updateUI();
  rebuildScene();
  if (activeMode === 'explore') rebuildExploreScene();
  showToast(`${furnitureLabel(item.kind)} removed`);
}

function furnitureIdAtPointer(event: Pick<MouseEvent, 'clientX' | 'clientY'>, objects: THREE.Object3D[], activeCamera: THREE.Camera): string | null {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, activeCamera);
  const hitObject = raycaster.intersectObjects(objects, true)[0]?.object;
  let current: THREE.Object3D | null = hitObject ?? null;
  while (current) {
    if (typeof current.userData.furnitureId === 'string') return current.userData.furnitureId;
    current = current.parent;
  }
  return null;
}

function placeFloorTable(x: number, z: number): void {
  if (!canPlaceTable(x, z, selectedFurnitureKind, furnitureRotation)) { showToast('That table needs a clear spot inside a room.'); return; }
  const size = tableDimensions(selectedFurnitureKind, furnitureRotation);
  const room = containingRoom(x, z, size.w, size.h)!;
  addFurniture({ id: crypto.randomUUID(), kind: selectedFurnitureKind, x, z, rotation: furnitureRotation, roomId: room.id });
}

function posterRoomForSide(segment: WallSegment, point: { x: number; z: number }): Room | null {
  const sides = roomsBesideWall(segment);
  const positiveSide = segment.axis === 'h' ? point.z > segment.y : point.x > segment.x;
  return (positiveSide ? sides.positive : sides.negative) ?? null;
}

function placeWallPoster(segment: WallSegment, point: { x: number; z: number }): void {
  if (plan.doors.some(door => door.key === segment.key)) { showToast('A poster cannot cover a door.'); return; }
  const room = posterRoomForSide(segment, point);
  if (!room) { showToast('Place the poster on a room wall.'); return; }
  if (plan.furniture.some(item => item.kind === 'poster' && item.wall?.key === segment.key && item.roomId === room.id)) { showToast('That side of the wall already has a poster.'); return; }
  addFurniture({ id: crypto.randomUUID(), kind: 'poster', x: segment.x, z: segment.y, rotation: 0, roomId: room.id, wall: segment });
}

function placeFurnitureFromExplore(): void {
  pointer.set(0, 0);
  raycaster.setFromCamera(pointer, playerCamera);
  const surface = raycaster.intersectObjects(exploreSurfaces, false)[0];
  if (!surface) { showToast('Aim at a floor or wall to place furniture.'); return; }
  if (selectedFurnitureKind === 'poster') {
    const wall = surface.object.userData.wallSegment as WallSegment | undefined;
    if (surface.object.userData.surfaceType !== 'wall' || !wall) { showToast('Aim at a wall to place the poster.'); return; }
    placeWallPoster(wall, playerPosition);
    return;
  }
  if (surface.object.userData.surfaceType !== 'floor') { showToast('Aim at the floor to place a table.'); return; }
  placeFloorTable(Math.floor(surface.point.x), Math.floor(surface.point.z));
}

function cycleFurniture(direction: number): void {
  const selections: Array<FurnitureKind | 'remove'> = ['table-1x1', 'table-2x1', 'poster', 'remove'];
  const index = selections.indexOf(exploreRemoveMode ? 'remove' : selectedFurnitureKind);
  const selection = selections[(index + direction + selections.length) % selections.length]!;
  exploreRemoveMode = selection === 'remove';
  if (selection !== 'remove') selectedFurnitureKind = selection;
  furnitureRotation = 0;
  if (activeMode === 'build') {
    activateBuildTool('furniture');
    document.querySelectorAll<HTMLButtonElement>('.furniture-choice').forEach(button => button.classList.toggle('active', button.dataset.furniture === selectedFurnitureKind));
    document.querySelector('#rotate-furniture')!.classList.toggle('hidden', selectedFurnitureKind !== 'table-2x1');
  }
  updateExploreSelection();
  exploreGhostKey = '';
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
  clearGroup(furnitureLayer);
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
  for (const item of plan.furniture) {
    if (item.kind === 'poster' && item.wall) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(item.wall.axis === 'h' ? 1 : 0.14, 0.035, item.wall.axis === 'h' ? 0.14 : 1), new THREE.MeshBasicMaterial({ color: 0x9278a6 }));
      const posterRoom = plan.rooms.find(room => room.id === item.roomId);
      const side = posterRoom ? (item.wall.axis === 'h' ? (posterRoom.y === item.wall.y ? 1 : -1) : (posterRoom.x === item.wall.x ? 1 : -1)) : 1;
      marker.position.set(item.wall.axis === 'h' ? item.wall.x + 0.5 : item.wall.x + side * 0.09, 0.13, item.wall.axis === 'h' ? item.wall.y + side * 0.09 : item.wall.y + 0.5);
      marker.userData.furnitureId = item.id;
      furnitureLayer.add(marker);
    } else if (item.kind !== 'poster') furnitureLayer.add(makeTableGroup(item));
  }
  startMarker.visible = activeMode === 'build' && plan.start !== null;
  if (plan.start) startMarker.position.set(plan.start.x, 0, plan.start.z);
  document.querySelector('#canvas-empty')!.classList.toggle('hidden', plan.rooms.length > 0);
  render();
}

function makeTableGroup(item: FurnitureItem): THREE.Group {
  const group = new THREE.Group();
  const { w, h } = tableDimensions(item.kind, item.rotation);
  const topMaterial = activeMode === 'build' ? new THREE.MeshBasicMaterial({ color: 0xa97850 }) : new THREE.MeshStandardMaterial({ color: 0xa97850, roughness: 0.78 });
  const edgeInset = 0.08;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w - edgeInset * 2, 0.075, h - edgeInset * 2), topMaterial);
  top.position.set(w / 2, TABLE_HEIGHT - 0.0375, h / 2);
  group.add(top);
  const legMaterial = activeMode === 'build' ? new THREE.MeshBasicMaterial({ color: 0x694c38 }) : new THREE.MeshStandardMaterial({ color: 0x694c38, roughness: 0.85 });
  const legWidth = 0.09;
  for (const x of [0.1, w - 0.1]) for (const z of [0.1, h - 0.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legWidth, TABLE_HEIGHT - 0.075, legWidth), legMaterial);
    leg.position.set(x, (TABLE_HEIGHT - 0.075) / 2, z);
    group.add(leg);
  }
  group.position.set(item.x, 0, item.z);
  group.userData.furnitureId = item.id;
  return group;
}

function posterOrientation(item: FurnitureItem): { rotationY: number; side: number; centerX: number; centerZ: number } | null {
  if (!item.wall) return null;
  const room = plan.rooms.find(candidate => candidate.id === item.roomId);
  if (!room) return null;
  const side = item.wall.axis === 'h' ? (room.y === item.wall.y ? 1 : -1) : (room.x === item.wall.x ? 1 : -1);
  return {
    rotationY: item.wall.axis === 'h' ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2),
    side,
    centerX: item.wall.axis === 'h' ? item.wall.x + 0.5 : item.wall.x,
    centerZ: item.wall.axis === 'h' ? item.wall.y : item.wall.y + 0.5,
  };
}

function makePosterGroup(item: FurnitureItem): THREE.Group {
  const group = new THREE.Group();
  const orientation = posterOrientation(item);
  if (!orientation || !item.wall) return group;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.32, 0.045), new THREE.MeshStandardMaterial({ color: 0x493d34, roughness: 0.82 }));
  frame.position.z = 0.025;
  group.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 1.18), new THREE.MeshStandardMaterial({ map: posterTexture, roughness: 0.92, side: THREE.DoubleSide }));
  art.position.z = 0.05;
  group.add(art);
  group.rotation.y = orientation.rotationY;
  group.position.set(orientation.centerX + (item.wall.axis === 'v' ? orientation.side * 0.078 : 0), 1.55, orientation.centerZ + (item.wall.axis === 'h' ? orientation.side * 0.078 : 0));
  group.userData.furnitureId = item.id;
  return group;
}

function makeFurnitureWireframe(item: FurnitureItem): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x79efb0, depthTest: false, transparent: true, opacity: 1 });
  const outline = (geometry: THREE.BoxGeometry, position: THREE.Vector3): void => {
    const edges = new THREE.EdgesGeometry(geometry);
    const lines = new THREE.LineSegments(edges, material);
    lines.position.copy(position);
    lines.renderOrder = 10;
    group.add(lines);
  };
  if (item.kind === 'poster' && item.wall) {
    const orientation = posterOrientation(item);
    if (!orientation) return group;
    outline(new THREE.BoxGeometry(0.9, 1.36, 0.06), new THREE.Vector3(0, 0, 0));
    group.rotation.y = orientation.rotationY;
    group.position.set(orientation.centerX + (item.wall.axis === 'v' ? orientation.side * 0.078 : 0), 1.55, orientation.centerZ + (item.wall.axis === 'h' ? orientation.side * 0.078 : 0));
    return group;
  }
  const { w, h } = tableDimensions(item.kind, item.rotation);
  const edgeInset = 0.08;
  outline(new THREE.BoxGeometry(w - edgeInset * 2, 0.09, h - edgeInset * 2), new THREE.Vector3(w / 2, TABLE_HEIGHT - 0.0375, h / 2));
  for (const x of [0.1, w - 0.1]) for (const z of [0.1, h - 0.1]) {
    outline(new THREE.BoxGeometry(0.11, TABLE_HEIGHT - 0.075, 0.11), new THREE.Vector3(x, (TABLE_HEIGHT - 0.075) / 2, z));
  }
  group.position.set(item.x, 0, item.z);
  return group;
}

function updateExploreGhost(): void {
  if (activeMode !== 'explore' || plan.rooms.length === 0) { exploreGhost.visible = false; return; }
  pointer.set(0, 0);
  raycaster.setFromCamera(pointer, playerCamera);
  if (exploreRemoveMode) {
    const rect = renderer.domElement.getBoundingClientRect();
    const id = furnitureIdAtPointer({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, exploreWorld.children, playerCamera);
    const item = id ? plan.furniture.find(furniture => furniture.id === id) : undefined;
    if (!item) { exploreGhost.visible = false; return; }
    const key = `remove:${item.id}`;
    if (key !== exploreGhostKey) {
      clearGroup(exploreGhost);
      exploreGhost.add(makeFurnitureWireframe(item));
      exploreGhostKey = key;
    }
    exploreGhost.traverse(object => { if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(0xff3f3f); });
    exploreGhost.visible = true;
    return;
  }
  const surface = raycaster.intersectObjects(exploreSurfaces, false)[0];
  if (!surface) { exploreGhost.visible = false; return; }
  let candidate: FurnitureItem;
  let valid = false;
  if (selectedFurnitureKind === 'poster') {
    const wall = surface.object.userData.wallSegment as WallSegment | undefined;
    if (surface.object.userData.surfaceType !== 'wall' || !wall) { exploreGhost.visible = false; return; }
    const room = posterRoomForSide(wall, playerPosition);
    if (!room) { exploreGhost.visible = false; return; }
    candidate = { id: 'preview', kind: 'poster', x: wall.x, z: wall.y, rotation: 0, roomId: room.id, wall };
    valid = !plan.doors.some(door => door.key === wall.key) && !plan.furniture.some(item => item.kind === 'poster' && item.wall?.key === wall.key && item.roomId === room.id);
  } else {
    if (surface.object.userData.surfaceType !== 'floor') { exploreGhost.visible = false; return; }
    const x = Math.floor(surface.point.x), z = Math.floor(surface.point.z);
    const size = tableDimensions(selectedFurnitureKind, furnitureRotation);
    const room = containingRoom(x, z, size.w, size.h);
    if (!room) { exploreGhost.visible = false; return; }
    candidate = { id: 'preview', kind: selectedFurnitureKind, x, z, rotation: furnitureRotation, roomId: room.id };
    valid = canPlaceTable(x, z, selectedFurnitureKind, furnitureRotation);
  }
  const key = `${candidate.kind}:${candidate.rotation}:${candidate.roomId}:${candidate.x}:${candidate.z}:${candidate.wall?.key ?? ''}`;
  if (key !== exploreGhostKey) {
    clearGroup(exploreGhost);
    exploreGhost.add(makeFurnitureWireframe(candidate));
    exploreGhostKey = key;
  }
  const color = valid ? 0x79efb0 : 0xff6868;
  exploreGhost.traverse(object => { if (object instanceof THREE.LineSegments) (object.material as THREE.LineBasicMaterial).color.setHex(color); });
  exploreGhost.visible = true;
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
  }
}

function roomsBesideWall(segment: WallSegment): { positive: Room | null; negative: Room | null } {
  let positive: Room | null = null;
  let negative: Room | null = null;
  for (const room of plan.rooms) {
    if (segment.axis === 'h' && segment.x >= room.x && segment.x + 1 <= room.x + room.w) {
      if (room.y === segment.y) positive = room;
      if (room.y + room.h === segment.y) negative = room;
    } else if (segment.axis === 'v' && segment.y >= room.y && segment.y + 1 <= room.y + room.h) {
      if (room.x === segment.x) positive = room;
      if (room.x + room.w === segment.x) negative = room;
    }
  }
  return { positive, negative };
}

function wallFaceMaterials(segment: WallSegment, baseColor: number): THREE.Material[] {
  const base = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.88 });
  const { positive, negative } = roomsBesideWall(segment);
  const tint = (room: Room | null): THREE.Material => room
    ? new THREE.MeshStandardMaterial({ color: new THREE.Color(room.color).lerp(new THREE.Color(0xffffff), 0.28), roughness: 0.9 })
    : base;
  const positiveFace = tint(positive), negativeFace = tint(negative);
  return segment.axis === 'h'
    ? [base, base, base, base, positiveFace, negativeFace]
    : [positiveFace, negativeFace, base, base, base, base];
}

function rebuildExploreScene(): void {
  clearGroup(exploreWorld);
  exploreSurfaces.length = 0;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x9fa7a0, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  exploreWorld.add(ground);
  for (const room of plan.rooms) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.h), new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.92, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x + room.w / 2, 0, room.y + room.h / 2);
    floor.userData.surfaceType = 'floor';
    floor.userData.roomId = room.id;
    exploreWorld.add(floor);
    exploreSurfaces.push(floor);
  }
  const doors = new Set(plan.doors.map(door => door.key));
  for (const segment of wallSegments()) {
    if (doors.has(segment.key)) {
      const headerHeight = WALL_HEIGHT - DOOR_HEIGHT;
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(segment.axis === 'h' ? 1 : 0.14, headerHeight, segment.axis === 'h' ? 0.14 : 1), wallFaceMaterials(segment, 0xb9b4a8),
      );
      header.position.set(segment.axis === 'h' ? segment.x + 0.5 : segment.x, DOOR_HEIGHT + headerHeight / 2, segment.axis === 'h' ? segment.y : segment.y + 0.5);
      exploreWorld.add(header);
      continue;
    }
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(segment.axis === 'h' ? 1 : 0.14, WALL_HEIGHT, segment.axis === 'h' ? 0.14 : 1), wallFaceMaterials(segment, 0xe0ddd3),
    );
    wall.position.set(segment.axis === 'h' ? segment.x + 0.5 : segment.x, WALL_HEIGHT / 2, segment.axis === 'h' ? segment.y : segment.y + 0.5);
    wall.userData.surfaceType = 'wall';
    wall.userData.wallSegment = segment;
    exploreWorld.add(wall);
    exploreSurfaces.push(wall);
  }
  for (const item of plan.furniture) exploreWorld.add(item.kind === 'poster' ? makePosterGroup(item) : makeTableGroup(item));
  exploreGhostKey = '';
  clearGroup(exploreGhost);
  exploreGhost.visible = false;
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

function activateBuildTool(tool: 'rooms' | 'start' | 'furniture' | 'remove'): void {
  activeTool = tool;
  document.querySelector('#rooms-tool')!.classList.toggle('active', tool === 'rooms');
  document.querySelector('#start-tool')!.classList.toggle('active', tool === 'start');
  document.querySelector('#furniture-tool')!.classList.toggle('active', tool === 'furniture');
  document.querySelector('#remove-furniture-tool')!.classList.toggle('active', tool === 'remove');
  document.querySelector('#furniture-picker')!.classList.toggle('hidden', tool !== 'furniture');
  document.querySelector('#canvas-hint')!.innerHTML = tool === 'rooms'
    ? '<span class="mouse-icon">⌖</span> Click empty space for a room · click a wall for a door'
    : tool === 'start'
      ? '<span class="mouse-icon">◎</span> Click inside a room to set the player start'
      : tool === 'furniture' ? '<span class="mouse-icon">▤</span> Click a floor tile or wall to place furniture'
        : '<span class="mouse-icon">⌫</span> Click placed furniture to remove it';
  preview.visible = false;
  furniturePreview.visible = false;
  render();
}

function chooseFurniture(kind: FurnitureKind): void {
  selectedFurnitureKind = kind;
  furnitureRotation = 0;
  document.querySelectorAll<HTMLButtonElement>('.furniture-choice').forEach(button => button.classList.toggle('active', button.dataset.furniture === kind));
  document.querySelector('#rotate-furniture')!.classList.toggle('hidden', kind !== 'table-2x1');
  updateExploreSelection();
  render();
}

function updateExploreSelection(): void {
  const rotation = selectedFurnitureKind === 'table-2x1' && furnitureRotation === 1 ? ' · rotated' : '';
  document.querySelector('#explore-item-name')!.textContent = exploreRemoveMode ? 'Remove furniture' : `${furnitureLabel(selectedFurnitureKind)}${rotation}`;
  document.querySelector('#explore-selection-hint')!.textContent = exploreRemoveMode ? 'Aim at an item · click to remove' : 'Click to place';
}

function rotateSelectedFurniture(): void {
  if (selectedFurnitureKind !== 'table-2x1') return;
  furnitureRotation = furnitureRotation === 0 ? 1 : 0;
  updateExploreSelection();
}

function updateFurniturePreview(cell: { x: number; y: number; worldX: number; worldZ: number }): void {
  if (selectedFurnitureKind === 'poster') {
    const wall = nearestWall({ x: cell.worldX, z: cell.worldZ });
    if (!wall) { furniturePreview.visible = false; render(); return; }
    const shape = wall.axis === 'h' ? 'poster-h' : 'poster-v';
    if (furniturePreviewShape !== shape) {
      furniturePreview.geometry.dispose();
      furniturePreview.geometry = wall.axis === 'h' ? new THREE.PlaneGeometry(1, 0.18) : new THREE.PlaneGeometry(0.18, 1);
      furniturePreviewShape = shape;
    }
    const room = posterRoomForSide(wall, { x: cell.worldX, z: cell.worldZ });
    const canPlace = !!room && !plan.doors.some(door => door.key === wall.key) && !plan.furniture.some(item => item.kind === 'poster' && item.wall?.key === wall.key && item.roomId === room.id);
    (furniturePreview.material as THREE.MeshBasicMaterial).color.set(canPlace ? 0x9278a6 : 0xd27862);
    furniturePreview.position.set(wall.axis === 'h' ? wall.x + 0.5 : wall.x, 0.14, wall.axis === 'h' ? wall.y : wall.y + 0.5);
    furniturePreview.visible = true; render(); return;
  }
  const size = tableDimensions(selectedFurnitureKind, furnitureRotation);
  const canPlace = canPlaceTable(cell.x, cell.y, selectedFurnitureKind, furnitureRotation);
  const shape = `table-${size.w}x${size.h}`;
  if (furniturePreviewShape !== shape) {
    furniturePreview.geometry.dispose(); furniturePreview.geometry = new THREE.PlaneGeometry(size.w, size.h);
    furniturePreviewShape = shape;
  }
  (furniturePreview.material as THREE.MeshBasicMaterial).color.set(canPlace ? 0x9f7655 : 0xd27862);
  furniturePreview.position.set(cell.x + size.w / 2, TABLE_HEIGHT + 0.02, cell.y + size.h / 2);
  furniturePreview.visible = true; render();
}

function setMode(mode: AppMode): void {
  activeMode = mode;
  document.querySelector('.workspace')!.classList.toggle('exploring', mode === 'explore');
  document.querySelector('#build-tab')!.classList.toggle('active', mode === 'build');
  document.querySelector('#explore-tab')!.classList.toggle('active', mode === 'explore');
  document.querySelector('#breadcrumb-root')!.textContent = mode === 'build' ? 'Escape room' : 'Explore mode';
  document.querySelector('#breadcrumb-view')!.textContent = mode === 'build' ? 'Floor plan' : 'First person';
  document.querySelector('#canvas-label-text')!.textContent = mode === 'build' ? 'TOP-DOWN VIEW' : 'FIRST PERSON VIEW';
  document.querySelector('#dimension-label')!.textContent = mode === 'build' ? '1 unit = 1m' : `walls ${WALL_HEIGHT}m high`;
  document.querySelector('#canvas-empty')!.classList.toggle('hidden', mode === 'explore' || plan.rooms.length > 0);
  const overlay = document.querySelector<HTMLDivElement>('#explore-overlay')!;
  overlay.classList.toggle('hidden', mode !== 'explore');
  document.querySelector('#explore-message')!.textContent = plan.rooms.length === 0
    ? 'Place a room in Build mode to explore.'
    : plan.start ? 'Click to look around' : 'No start marker set · starting in the first room';
  if (mode === 'explore') {
    document.exitPointerLock?.();
    pressedKeys.clear();
    if (plan.rooms.length) {
      const startingRoom = plan.rooms.find(room => room.id === plan.start?.roomId) ?? plan.rooms[0]!;
      playerPosition.set(plan.start?.x ?? startingRoom.x + startingRoom.w / 2, 1.65, plan.start?.z ?? startingRoom.y + startingRoom.h / 2);
      playerYaw = 0; playerPitch = 0;
      playerCamera.position.copy(playerPosition);
      playerCamera.rotation.set(playerPitch, playerYaw, 0);
      rebuildExploreScene();
    }
    previousFrameTime = performance.now();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(exploreFrame);
  } else {
    cancelAnimationFrame(animationFrame);
    document.exitPointerLock?.();
    pressedKeys.clear();
    rebuildScene();
  }
  requestAnimationFrame(() => { resize(); alignCrosshair(); });
  render();
}

function insideAnyRoom(x: number, z: number): boolean {
  return plan.rooms.some(room => x >= room.x && x <= room.x + room.w && z >= room.y && z <= room.y + room.h);
}

function canPlayerOccupy(x: number, z: number): boolean {
  if (!insideAnyRoom(x, z)) return false;
  const doorKeys = new Set(plan.doors.map(door => door.key));
  if (wallSegments().some(segment => !doorKeys.has(segment.key) && wallDistance({ x, z }, segment) < PLAYER_RADIUS)) return false;
  for (const item of plan.furniture) {
    if (item.kind === 'poster') continue;
    const size = tableDimensions(item.kind, item.rotation);
    const closestX = THREE.MathUtils.clamp(x, item.x, item.x + size.w);
    const closestZ = THREE.MathUtils.clamp(z, item.z, item.z + size.h);
    if (Math.hypot(x - closestX, z - closestZ) < PLAYER_RADIUS + 0.04) return false;
  }
  return true;
}

function exploreFrame(time: number): void {
  if (activeMode !== 'explore') return;
  const delta = Math.min((time - previousFrameTime) / 1000, 0.05);
  previousFrameTime = time;
  let forward = Number(pressedKeys.has('w') || pressedKeys.has('arrowup')) - Number(pressedKeys.has('s') || pressedKeys.has('arrowdown'));
  let sideways = Number(pressedKeys.has('d') || pressedKeys.has('arrowright')) - Number(pressedKeys.has('a') || pressedKeys.has('arrowleft'));
  const magnitude = Math.hypot(forward, sideways);
  if (magnitude > 0) { forward /= magnitude; sideways /= magnitude; }
  const moveX = (-Math.sin(playerYaw) * forward + Math.cos(playerYaw) * sideways) * PLAYER_SPEED * delta;
  const moveZ = (-Math.cos(playerYaw) * forward - Math.sin(playerYaw) * sideways) * PLAYER_SPEED * delta;
  if (canPlayerOccupy(playerPosition.x + moveX, playerPosition.z)) playerPosition.x += moveX;
  if (canPlayerOccupy(playerPosition.x, playerPosition.z + moveZ)) playerPosition.z += moveZ;
  playerCamera.position.copy(playerPosition);
  updateExploreGhost();
  render();
  animationFrame = requestAnimationFrame(exploreFrame);
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (activeMode !== 'build') return;
  if (event.button !== 1 && !(event.button === 0 && spaceHeld)) return;
  event.preventDefault();
  panState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, centerX: viewCenterX, centerZ: viewCenterZ };
  preview.visible = false;
  highlightWall(null);
  renderer.domElement.style.cursor = 'grabbing';
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (activeMode !== 'build') return;
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
  if (activeTool === 'remove') {
    preview.visible = false; furniturePreview.visible = false; highlightWall(null);
    renderer.domElement.style.cursor = furnitureIdAtPointer(event, furnitureLayer.children, camera) ? 'pointer' : 'not-allowed';
    return;
  }
  if (activeTool === 'furniture') {
    highlightWall(null); preview.visible = false;
    updateFurniturePreview(cell);
    renderer.domElement.style.cursor = selectedFurnitureKind === 'poster' && nearestWall({ x: cell.worldX, z: cell.worldZ }) ? 'pointer' : 'copy';
    return;
  }
  if (activeTool === 'start') {
    highlightWall(null); preview.visible = false;
    renderer.domElement.style.cursor = 'crosshair';
    return;
  }
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
  if (activeMode !== 'build') return;
  if (panState?.pointerId === event.pointerId) {
    panState = null;
    renderer.domElement.style.cursor = spaceHeld ? 'grab' : '';
    return;
  }
  if (event.button !== 0) return;
  if (activeTool === 'remove') {
    const id = furnitureIdAtPointer(event, furnitureLayer.children, camera);
    if (id) removeFurniture(id); else showToast('Click placed furniture to remove it.');
    return;
  }
  const cell = screenToWorld(event); if (!cell) return;
  if (activeTool === 'furniture') {
    furniturePreview.visible = false;
    if (selectedFurnitureKind === 'poster') {
      const wall = nearestWall({ x: cell.worldX, z: cell.worldZ });
      if (wall) placeWallPoster(wall, { x: cell.worldX, z: cell.worldZ }); else showToast('Click a wall segment to place the poster.');
    } else placeFloorTable(cell.x, cell.y);
    return;
  }
  if (activeTool === 'start') {
    const intersections = raycaster.intersectObjects(roomLayer.children.filter(obj => obj instanceof THREE.Mesh), false);
    const roomId = intersections[0]?.object.userData.roomId as string | undefined;
    const room = plan.rooms.find(item => item.id === roomId);
    if (!room) { showToast('Place the start marker inside a room.'); return; }
    plan.start = {
      x: THREE.MathUtils.clamp(cell.worldX, room.x + PLAYER_RADIUS + 0.08, room.x + room.w - PLAYER_RADIUS - 0.08),
      z: THREE.MathUtils.clamp(cell.worldZ, room.y + PLAYER_RADIUS + 0.08, room.y + room.h - PLAYER_RADIUS - 0.08),
      roomId: room.id,
    };
    markChanged(); rebuildScene(); showToast('Player start set');
    return;
  }
  const wall = nearestWall({ x: cell.worldX, z: cell.worldZ });
  if (wall) {
    const existing = plan.doors.findIndex(door => door.key === wall.key);
    if (existing >= 0) { plan.doors.splice(existing, 1); showToast('Door removed'); }
    else if (plan.furniture.some(item => item.kind === 'poster' && item.wall?.key === wall.key)) { showToast('Remove the poster before adding a door here.'); return; }
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
renderer.domElement.addEventListener('click', () => {
  if (activeMode !== 'explore' || plan.rooms.length === 0) return;
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  else if (exploreRemoveMode) {
    const rect = renderer.domElement.getBoundingClientRect();
    const id = furnitureIdAtPointer({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, exploreWorld.children, playerCamera);
    if (id) removeFurniture(id); else showToast('Aim at furniture to remove it.');
  } else placeFurnitureFromExplore();
});
document.querySelector('#explore-exit')!.addEventListener('click', () => setMode('build'));
document.addEventListener('pointerlockchange', () => {
  const overlay = document.querySelector('#explore-overlay')!;
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('locked', locked);
  if (!locked) pressedKeys.clear();
});
window.addEventListener('mousemove', event => {
  if (activeMode !== 'explore' || document.pointerLockElement !== renderer.domElement) return;
  playerYaw -= event.movementX * 0.0024;
  playerPitch = THREE.MathUtils.clamp(playerPitch - event.movementY * 0.0024, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  playerCamera.rotation.set(playerPitch, playerYaw, 0);
});
renderer.domElement.addEventListener('pointercancel', event => { if (panState?.pointerId === event.pointerId) panState = null; });
renderer.domElement.addEventListener('wheel', event => {
  if (activeMode === 'explore') { event.preventDefault(); cycleFurniture(event.deltaY > 0 ? 1 : -1); return; }
  if (activeMode !== 'build') return;
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
renderer.domElement.addEventListener('pointerleave', () => { preview.visible = false; furniturePreview.visible = false; highlightWall(null); });
function updatePreview(cell: { x: number; y: number }): void {
  const rect = { x: cell.x - Math.floor(ROOM_SIZE / 2), y: cell.y - Math.floor(ROOM_SIZE / 2), w: ROOM_SIZE, h: ROOM_SIZE };
  preview.position.set(rect.x + rect.w / 2, 0.015, rect.y + rect.h / 2);
  preview.scale.set(rect.w, rect.h, 1);
  preview.material.color.set(plan.rooms.length && !plan.rooms.some(r => touchesRoom(rect, r)) ? 0xd27862 : 0x526d64);
  preview.visible = true; render();
}

function updateUI(): void {
  const list = document.querySelector<HTMLDivElement>('#room-list')!;
  const furnitureList = document.querySelector<HTMLDivElement>('#furniture-list')!;
  document.querySelector('#room-count')!.textContent = String(plan.rooms.length);
  document.querySelector('#furniture-count')!.textContent = String(plan.furniture.length);
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
  furnitureList.innerHTML = '';
  plan.furniture.forEach(item => {
    const row = document.createElement('div');
    row.className = 'furniture-row';
    const detail = item.kind === 'poster' ? 'Wall fixture' : `${tableDimensions(item.kind, item.rotation).w} × ${tableDimensions(item.kind, item.rotation).h} m`;
    row.innerHTML = `<span class="furniture-row-icon">${item.kind === 'poster' ? '▧' : '▤'}</span><span class="furniture-row-copy"><strong></strong><small>${detail}</small></span><button class="furniture-remove" aria-label="Remove ${furnitureLabel(item.kind)}">×</button>`;
    row.querySelector('strong')!.textContent = furnitureLabel(item.kind);
    row.querySelector('.furniture-remove')!.addEventListener('click', () => {
      plan.furniture = plan.furniture.filter(furniture => furniture.id !== item.id);
      markChanged(); updateUI(); rebuildScene();
      if (activeMode === 'explore') rebuildExploreScene();
    });
    furnitureList.appendChild(row);
  });
  document.querySelector('#furniture-count')!.textContent = String(plan.furniture.length);
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
    content.querySelector('#delete-room')!.addEventListener('click', () => { const at = plan.rooms.findIndex(r => r.id === selected.id); plan.rooms.splice(at, 1); if (plan.start?.roomId === selected.id) plan.start = null; plan.furniture = plan.furniture.filter(item => item.roomId !== selected.id); const validWallKeys = new Set(wallSegments().map(wall => wall.key)); plan.doors = plan.doors.filter(door => validWallKeys.has(door.key)); plan.selectedId = plan.rooms[Math.max(0, at - 1)]?.id ?? null; markChanged(); updateUI(); rebuildScene(); });
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
function savePlan(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rooms: plan.rooms, doors: plan.doors, start: plan.start, furniture: plan.furniture, selectedId: plan.selectedId, roomCounter })); document.querySelector('#saved-state')!.textContent = 'Saved locally'; document.querySelector('#status-message')!.textContent = 'Saved in this browser'; }
function loadPlan(): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { showToast('No saved plan in this browser yet.'); return; }
  try { const data = JSON.parse(raw) as Partial<Plan> & { roomCounter?: number }; if (!Array.isArray(data.rooms)) throw new Error('Invalid plan'); plan.rooms = data.rooms; plan.doors = Array.isArray(data.doors) ? data.doors : []; plan.start = data.start ?? null; plan.furniture = Array.isArray(data.furniture) ? data.furniture : []; plan.selectedId = data.selectedId ?? null; roomCounter = data.roomCounter ?? plan.rooms.length; updateUI(); fitView(); showToast('Your saved plan is ready.'); }
  catch { showToast('That saved plan couldn’t be opened.'); }
}
function showToast(message: string): void { const toast = document.querySelector<HTMLDivElement>('#toast')!; toast.textContent = message; toast.classList.add('visible'); window.setTimeout(() => toast.classList.remove('visible'), 2200); }

document.querySelector('#save-button')!.addEventListener('click', savePlan);
document.querySelector('#load-button')!.addEventListener('click', loadPlan);
document.querySelector('#build-tab')!.addEventListener('click', () => setMode('build'));
document.querySelector('#explore-tab')!.addEventListener('click', () => setMode('explore'));
document.querySelector('#rooms-tool')!.addEventListener('click', () => activateBuildTool('rooms'));
document.querySelector('#start-tool')!.addEventListener('click', () => activateBuildTool('start'));
document.querySelector('#furniture-tool')!.addEventListener('click', () => activateBuildTool('furniture'));
document.querySelector('#remove-furniture-tool')!.addEventListener('click', () => activateBuildTool('remove'));
document.querySelectorAll<HTMLButtonElement>('.furniture-choice').forEach(button => button.addEventListener('click', () => chooseFurniture(button.dataset.furniture as FurnitureKind)));
document.querySelector('#rotate-furniture')!.addEventListener('click', rotateSelectedFurniture);
document.querySelector('#zoom-in')!.addEventListener('click', () => zoom(1.18));
document.querySelector('#zoom-out')!.addEventListener('click', () => zoom(1 / 1.18));
document.querySelector('#fit-view')!.addEventListener('click', fitView);
document.querySelector('#first-room')!.addEventListener('click', () => showToast('Click an empty spot on the canvas to place a 5 × 5 m room.'));
window.addEventListener('keydown', event => {
  const target = event.target;
  const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if (activeMode === 'build' && !typing && event.key.toLowerCase() === 'r') activateBuildTool('rooms');
  if (activeMode === 'explore' && !typing && event.key.toLowerCase() === 'r') { rotateSelectedFurniture(); event.preventDefault(); }
  if (activeMode === 'explore' && !typing && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(event.key.toLowerCase())) {
    pressedKeys.add(event.key.toLowerCase()); event.preventDefault();
  }
  if (activeMode === 'explore' && !typing && event.key.toLowerCase() === 'b') { setMode('build'); event.preventDefault(); return; }
  if (event.code === 'Space' && !typing) { spaceHeld = true; renderer.domElement.style.cursor = 'grab'; event.preventDefault(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); savePlan(); }
});
window.addEventListener('keyup', event => {
  if (event.code === 'Space') { spaceHeld = false; renderer.domElement.style.cursor = ''; }
  pressedKeys.delete(event.key.toLowerCase());
});
window.addEventListener('blur', () => { spaceHeld = false; panState = null; renderer.domElement.style.cursor = ''; });
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(mount);
resize(); updateUI(); loadPlan();
