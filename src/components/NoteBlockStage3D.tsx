import { Camera, Compass, Eye, RotateCcw } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { PlayEvent } from '../audio/player';
import {
  INSTRUMENTS,
  midiForClicks,
  noteParticleColor,
  pitchName,
  type InstrumentId,
} from '../domain/instruments';
import type { ScoreModel } from '../domain/score';
import { ROLES, ROLE_LABELS, type Role } from '../domain/types';

export interface NoteBlockStage3DHandle {
  triggerEvent: (event: PlayEvent) => void;
}

interface NoteBlockStage3DProps {
  scores: Partial<Record<Role, ScoreModel>>;
  events: PlayEvent[];
  currentTime: number;
  playing: boolean;
  mutedRoles: ReadonlySet<Role>;
  onAudition: (instrument: InstrumentId, midi: number) => void;
}

type CameraPreset = 'iso' | 'front' | 'top';

const PRESET_VIEWS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { pos: [7.2, 6.2, 8.8], target: [0, 1.0, -1.2] },
  front: { pos: [0, 3.6, 9.6], target: [0, 1.1, -0.4] },
  top: { pos: [0, 11.5, 2.2], target: [0, 0.5, -2.5] },
};

function createNoteBlockTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  // Warm dark oak frame
  ctx.fillStyle = '#5e3c23';
  ctx.fillRect(0, 0, 16, 16);

  // Inner slatted wood planks
  ctx.fillStyle = '#7b5031';
  ctx.fillRect(1, 1, 14, 14);

  // Horizontal grain slats
  ctx.fillStyle = '#6c4428';
  for (let y = 2; y < 14; y += 3) {
    ctx.fillRect(1, y, 14, 1);
  }

  // Carved musical note emblem in center
  ctx.fillStyle = '#2d1a0d';
  ctx.fillRect(7, 4, 2, 7);
  ctx.fillRect(9, 4, 3, 2);
  ctx.fillRect(5, 9, 3, 3);

  // Subtle corner brass pins
  ctx.fillStyle = '#c9a35b';
  ctx.fillRect(1, 1, 1, 1);
  ctx.fillRect(14, 1, 1, 1);
  ctx.fillRect(1, 14, 1, 1);
  ctx.fillRect(14, 14, 1, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBaseBlockTexture(
  primary: string,
  accent: string,
  id: InstrumentId,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, 16, 16);

  ctx.fillStyle = accent;
  if (id === 'bass' || id === 'banjo') {
    // Plank / bale stripes
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    ctx.fillRect(7, 0, 1, 8);
    ctx.fillRect(12, 8, 1, 8);
  } else if (
    id === 'bell' ||
    id === 'bit' ||
    id === 'iron_xylophone' ||
    id === 'pling' ||
    id.includes('trumpet')
  ) {
    // Metallic bevel border
    ctx.fillRect(0, 0, 16, 2);
    ctx.fillRect(0, 14, 16, 2);
    ctx.fillRect(0, 0, 2, 16);
    ctx.fillRect(14, 0, 2, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(2, 2, 12, 1);
    ctx.fillRect(2, 2, 1, 12);
  } else {
    // Deterministic voxel speckle
    for (let y = 0; y < 16; y += 2) {
      for (let x = 0; x < 16; x += 2) {
        if ((x * 7 + y * 13) % 5 === 0) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

const _vec3 = new THREE.Vector3();
const _targetVec = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3(1, 1, 1);
const _color = new THREE.Color();

export const NoteBlockStage3D = forwardRef<NoteBlockStage3DHandle, NoteBlockStage3DProps>(
  function NoteBlockStage3D(
    { scores, events, currentTime, playing, mutedRoles, onAudition },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [contextLost, setContextLost] = useState(false);
    const [inspected, setInspected] = useState<string>(
      'Click any Note Block in the 3D stage to audition its instrument',
    );
    const [preset, setPreset] = useState<CameraPreset>('iso');

    // Mutable refs read inside WebGL animation loop so React updates never tear down scene
    const eventsRef = useRef(events);
    const currentTimeRef = useRef(currentTime);
    const playingRef = useRef(playing);
    const mutedRef = useRef(mutedRoles);
    const onAuditionRef = useRef(onAudition);
    const scoresRef = useRef(scores);

    eventsRef.current = events;
    currentTimeRef.current = currentTime;
    playingRef.current = playing;
    mutedRef.current = mutedRoles;
    onAuditionRef.current = onAudition;
    scoresRef.current = scores;

    const triggerQueueRef = useRef<PlayEvent[]>([]);
    const cameraTargetPresetRef = useRef<{
      active: boolean;
      pos: THREE.Vector3;
      target: THREE.Vector3;
    }>({
      active: false,
      pos: new THREE.Vector3(...PRESET_VIEWS.iso.pos),
      target: new THREE.Vector3(...PRESET_VIEWS.iso.target),
    });

    const rebuildStationsRef = useRef<(() => void) | null>(null);
    const requestRenderRef = useRef<(() => void) | null>(null);

    useImperativeHandle(ref, () => ({
      triggerEvent: (event: PlayEvent) => {
        triggerQueueRef.current.push(event);
        requestRenderRef.current?.();
      },
    }));

    const activeRoles = ROLES.filter((r) => scores[r] && !scores[r]!.empty);
    const activeRolesKey = activeRoles
      .map((r) => `${r}:${scores[r]?.instrument ?? 'perc'}`)
      .join('|');

    useEffect(() => {
      rebuildStationsRef.current?.();
      requestRenderRef.current?.();
    }, [activeRolesKey, mutedRoles]);

    useEffect(() => {
      if (playing) requestRenderRef.current?.();
    }, [playing, currentTime]);

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      // Software WebGL probe
      const isSoftwareGl = (() => {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const rect = container.getBoundingClientRect();
      const initW = Math.max(320, rect.width || 800);
      const initH = Math.max(280, rect.height || 360);
      renderer.setSize(initW, initH);
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const canvas = renderer.domElement;
      const handleLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleRestored = () => {
        setContextLost(false);
        requestRender();
      };
      canvas.addEventListener('webglcontextlost', handleLost);
      canvas.addEventListener('webglcontextrestored', handleRestored);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);
      scene.fog = new THREE.FogExp2(0x0f172a, 0.032);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmremGenerator.dispose();

      const camera = new THREE.PerspectiveCamera(44, initW / initH, 0.1, 100);
      camera.position.set(...PRESET_VIEWS.iso.pos);

      const controls = new OrbitControls(camera, canvas);
      controls.target.set(...PRESET_VIEWS.iso.target);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 4;
      controls.maxDistance = 24;
      controls.maxPolarAngle = Math.PI / 2 - 0.06;
      controls.update();

      controls.addEventListener('start', () => {
        cameraTargetPresetRef.current.active = false;
      });
      controls.addEventListener('change', () => {
        requestRender();
      });

      // Studio 3-point lighting
      const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.55);
      keyLight.position.set(7, 11, 6);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 30;
      const d = 9;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
      rimLight.position.set(-6, 5, -8);
      scene.add(rimLight);

      // Ground stage plane & subtle architectural grid
      const groundGeo = new THREE.PlaneGeometry(42, 42);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x141e33,
        roughness: 0.9,
        metalness: 0.08,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      scene.add(ground);

      const grid = new THREE.GridHelper(32, 32, 0x334155, 0x1e293b);
      grid.position.y = 0.01;
      scene.add(grid);

      // Trigger line bar across z = 0
      const triggerLineGeo = new THREE.BoxGeometry(11.5, 0.04, 0.08);
      const triggerLineMat = new THREE.MeshStandardMaterial({
        color: 0xdc2626,
        emissive: 0xef4444,
        emissiveIntensity: 0.9,
        roughness: 0.3,
      });
      const triggerLine = new THREE.Mesh(triggerLineGeo, triggerLineMat);
      triggerLine.position.set(0, 0.03, 0);
      scene.add(triggerLine);

      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const noteBlockTex = createNoteBlockTexture(maxAniso);
      const noteBlockGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
      const baseBlockGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
      const plinthGeo = new THREE.BoxGeometry(1.25, 0.22, 1.25);
      const ringGeo = new THREE.BoxGeometry(0.72, 0.08, 0.72);
      const repeaterBaseGeo = new THREE.BoxGeometry(0.78, 0.14, 0.78);
      const torchGeo = new THREE.BoxGeometry(0.14, 0.28, 0.14);

      const plinthMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.75,
        metalness: 0.15,
      });
      const repeaterMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.8,
        metalness: 0.1,
      });

      interface StationRig {
        role: Role;
        instrument: InstrumentId;
        x: number;
        group: THREE.Group;
        noteCube: THREE.Mesh;
        ringMat: THREE.MeshStandardMaterial;
        torchMat: THREE.MeshStandardMaterial;
        bounce: number;
        flash: number;
        lastClicks: number;
      }

      const stationsGroup = new THREE.Group();
      scene.add(stationsGroup);
      let stations: StationRig[] = [];
      const disposableTextures: THREE.Texture[] = [noteBlockTex];
      const disposableMaterials: THREE.Material[] = [
        groundMat,
        triggerLineMat,
        plinthMat,
        repeaterMat,
      ];

      // Instanced upcoming note markers gliding along -Z -> 0
      const MAX_SCROLL_NOTES = 220;
      const scrollGeo = new THREE.BoxGeometry(0.54, 0.36, 0.54);
      const scrollMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.15,
      });
      const scrollMesh = new THREE.InstancedMesh(scrollGeo, scrollMat, MAX_SCROLL_NOTES);
      scrollMesh.frustumCulled = false;
      scrollMesh.count = 0;
      scene.add(scrollMesh);

      // Pooled floating note particles on trigger
      interface Particle {
        mesh: THREE.Mesh;
        mat: THREE.MeshStandardMaterial;
        life: number;
        vy: number;
        vx: number;
      }
      const particleGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
      const particles: Particle[] = [];
      for (let i = 0; i < 24; i += 1) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x22c55e,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0,
        });
        const mesh = new THREE.Mesh(particleGeo, mat);
        mesh.visible = false;
        scene.add(mesh);
        particles.push({ mesh, mat, life: 0, vy: 0, vx: 0 });
      }

      const spawnParticle = (x: number, y: number, z: number, hexColor: string) => {
        const slot = particles.find((p) => p.life <= 0) ?? particles[0];
        slot.life = 1;
        slot.vy = 1.8 + Math.random() * 0.9;
        slot.vx = (Math.random() - 0.5) * 0.7;
        slot.mesh.position.set(x + (Math.random() - 0.5) * 0.35, y, z);
        slot.mesh.rotation.set(Math.random(), Math.random(), 0);
        slot.mat.color.set(hexColor);
        slot.mat.emissive.set(hexColor);
        slot.mat.opacity = 1;
        slot.mesh.visible = true;
      };

      const buildStations = () => {
        while (stationsGroup.children.length > 0) {
          stationsGroup.remove(stationsGroup.children[0]);
        }
        stations = [];

        const currentScores = scoresRef.current;
        const roles = ROLES.filter((r) => currentScores[r] && !currentScores[r]!.empty);
        const spacing = 2.55;
        const startX = -((roles.length - 1) * spacing) / 2;

        roles.forEach((role, idx) => {
          const score = currentScores[role]!;
          const instId: InstrumentId =
            role === 'drums' ? 'snare' : (score.instrument ?? 'harp');
          const inst = INSTRUMENTS[instId];
          const x = startX + idx * spacing;
          const isMuted = mutedRef.current.has(role);

          const group = new THREE.Group();
          group.position.set(x, 0, 0);

          // 1. Stone plinth
          const plinth = new THREE.Mesh(plinthGeo, plinthMat);
          plinth.position.y = 0.11;
          plinth.receiveShadow = true;
          group.add(plinth);

          // 2. Lane track rail extending into -Z
          const trackGeo = new THREE.BoxGeometry(0.68, 0.06, 12);
          const trackMesh = new THREE.Mesh(trackGeo, plinthMat);
          trackMesh.position.set(0, 0.03, -6.5);
          trackMesh.receiveShadow = true;
          group.add(trackMesh);

          // 3. Base block underneath
          const baseTex = createBaseBlockTexture(
            inst.blockColor,
            inst.blockAccent,
            instId,
            maxAniso,
          );
          disposableTextures.push(baseTex);
          const baseMat = new THREE.MeshStandardMaterial({
            map: baseTex,
            roughness: instId === 'bell' || instId === 'iron_xylophone' ? 0.25 : 0.72,
            metalness: instId === 'bell' || instId === 'iron_xylophone' || instId.includes('trumpet') ? 0.78 : 0.08,
            transparent: isMuted,
            opacity: isMuted ? 0.4 : 1,
          });
          disposableMaterials.push(baseMat);
          const baseCube = new THREE.Mesh(baseBlockGeo, baseMat);
          baseCube.position.y = 0.72;
          baseCube.castShadow = true;
          baseCube.receiveShadow = true;
          group.add(baseCube);

          // 4. Note Block on top
          const noteMat = new THREE.MeshStandardMaterial({
            map: noteBlockTex,
            roughness: 0.65,
            metalness: 0.06,
            transparent: isMuted,
            opacity: isMuted ? 0.45 : 1,
          });
          disposableMaterials.push(noteMat);
          const noteCube = new THREE.Mesh(noteBlockGeo, noteMat);
          noteCube.position.y = 1.72;
          noteCube.castShadow = true;
          noteCube.receiveShadow = true;
          noteCube.layers.enable(1);
          noteCube.userData = { role, instrument: instId };
          group.add(noteCube);

          // 5. Top tuning color indicator plate
          const ringMat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            emissive: 0x16a34a,
            emissiveIntensity: 0.25,
            roughness: 0.3,
          });
          disposableMaterials.push(ringMat);
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.y = 2.24;
          group.add(ring);

          // 6. Front Redstone Repeater pedestal + glowing torch
          const repBase = new THREE.Mesh(repeaterBaseGeo, repeaterMat);
          repBase.position.set(0, 0.07, 1.15);
          repBase.receiveShadow = true;
          group.add(repBase);

          const torchMat = new THREE.MeshStandardMaterial({
            color: 0x7f1d1d,
            emissive: 0xdc2626,
            emissiveIntensity: 0.2,
            roughness: 0.4,
          });
          disposableMaterials.push(torchMat);
          const torch = new THREE.Mesh(torchGeo, torchMat);
          torch.position.set(0, 0.28, 1.15);
          group.add(torch);

          stationsGroup.add(group);
          stations.push({
            role,
            instrument: instId,
            x,
            group,
            noteCube,
            ringMat,
            torchMat,
            bounce: 0,
            flash: 0,
            lastClicks: 12,
          });
        });
      };

      rebuildStationsRef.current = buildStations;
      buildStations();

      // Raycasting for clicking 3D note blocks
      const raycaster = new THREE.Raycaster();
      raycaster.layers.set(1);
      const mouse = new THREE.Vector2();
      let pointerDownPos = { x: 0, y: 0 };

      const handlePointerDown = (e: PointerEvent) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
      };

      const handlePointerUp = (e: PointerEvent) => {
        const dx = e.clientX - pointerDownPos.x;
        const dy = e.clientY - pointerDownPos.y;
        if (Math.hypot(dx, dy) > 6) return; // Dragging OrbitControls, not clicking

        const bounds = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - bounds.left) / bounds.width) * 2 - 1;
        mouse.y = -((e.clientY - bounds.top) / bounds.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(
          stations.map((s) => s.noteCube),
          false,
        );
        if (hits.length > 0) {
          const hitRole = hits[0].object.userData.role as Role;
          const station = stations.find((s) => s.role === hitRole);
          if (!station) return;
          const midi =
            hitRole === 'drums'
              ? 60
              : (midiForClicks(station.instrument, station.lastClicks) ??
                INSTRUMENTS[station.instrument].baseMidi ??
                60);
          station.bounce = 1;
          station.flash = 1;
          const hex = noteParticleColor(hitRole === 'drums' ? null : station.lastClicks);
          spawnParticle(station.x, 2.45, 0, hex);
          onAuditionRef.current(station.instrument, midi);
          setInspected(
            `${ROLE_LABELS[hitRole]} · ${INSTRUMENTS[station.instrument].label} · Place on ${INSTRUMENTS[station.instrument].block}${
              hitRole === 'drums'
                ? ''
                : ` · ${station.lastClicks} clicks (${pitchName(midi)})`
            }`,
          );
          requestRender();
        }
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointerup', handlePointerUp);

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(300, entry.contentRect.width);
          const h = Math.max(260, entry.contentRect.height);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          requestRender();
        }
      });
      resizeObserver.observe(container);

      // Compile shaders once on hardware GPU
      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Render scheduling: on-demand when idle, rAF / afterDraw when animating
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let lastNow = performance.now();

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      const stepScene = (dt: number): boolean => {
        let needsMoreFrames = playingRef.current;

        // Smooth camera preset transition
        if (cameraTargetPresetRef.current.active) {
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            cameraTargetPresetRef.current.pos.x,
            6,
            dt,
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            cameraTargetPresetRef.current.pos.y,
            6,
            dt,
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            cameraTargetPresetRef.current.pos.z,
            6,
            dt,
          );
          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            cameraTargetPresetRef.current.target.x,
            6,
            dt,
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            cameraTargetPresetRef.current.target.y,
            6,
            dt,
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            cameraTargetPresetRef.current.target.z,
            6,
            dt,
          );
          const dist =
            camera.position.distanceTo(cameraTargetPresetRef.current.pos) +
            controls.target.distanceTo(cameraTargetPresetRef.current.target);
          if (dist < 0.02) {
            cameraTargetPresetRef.current.active = false;
          } else {
            needsMoreFrames = true;
          }
        }

        // Consume triggered note events
        while (triggerQueueRef.current.length > 0) {
          const ev = triggerQueueRef.current.shift()!;
          const st = stations.find((s) => s.role === ev.role);
          if (st) {
            st.bounce = 1;
            st.flash = 1;
            if (ev.clicks !== null) st.lastClicks = ev.clicks;
            const hex = noteParticleColor(ev.clicks);
            st.ringMat.color.set(hex);
            st.ringMat.emissive.set(hex);
            spawnParticle(st.x, 2.45, 0, hex);
            needsMoreFrames = true;
          }
        }

        // Update station bounces & redstone flash
        for (const st of stations) {
          if (st.bounce > 0.005 || st.flash > 0.005) {
            st.bounce = THREE.MathUtils.damp(st.bounce, 0, 12, dt);
            st.flash = THREE.MathUtils.damp(st.flash, 0, 10, dt);
            st.noteCube.position.y = 1.72 + Math.sin(st.bounce * Math.PI) * 0.24;
            const s = 1 + st.bounce * 0.07;
            st.noteCube.scale.set(s, 1 - st.bounce * 0.05, s);
            st.ringMat.emissiveIntensity = 0.25 + st.flash * 1.4;
            st.torchMat.emissiveIntensity = 0.2 + st.flash * 1.8;
            needsMoreFrames = true;
          } else {
            st.noteCube.position.y = 1.72;
            st.noteCube.scale.set(1, 1, 1);
            st.ringMat.emissiveIntensity = 0.25;
            st.torchMat.emissiveIntensity = 0.2;
          }
        }

        // Update floating note particles
        for (const p of particles) {
          if (p.life > 0) {
            p.life = Math.max(0, p.life - dt * 1.35);
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.x += p.vx * dt;
            p.mesh.rotation.y += dt * 2.5;
            p.mat.opacity = p.life;
            if (p.life <= 0) {
              p.mesh.visible = false;
            } else {
              needsMoreFrames = true;
            }
          }
        }

        // Update scrolling note track along -Z
        const tNow = currentTimeRef.current;
        const speedZ = 3.2; // units per second
        let instanceIdx = 0;
        const stationByRole = new Map(stations.map((s) => [s.role, s]));
        for (const ev of eventsRef.current) {
          const delta = ev.time - tNow;
          if (delta < -0.15 || delta > 3.8) continue;
          const st = stationByRole.get(ev.role);
          if (!st) continue;
          if (instanceIdx >= MAX_SCROLL_NOTES) break;

          const z = -1.15 - delta * speedZ;
          _vec3.set(st.x, 0.28, z);
          _mat4.compose(_vec3, _quat, _scaleVec);
          scrollMesh.setMatrixAt(instanceIdx, _mat4);
          _color.set(noteParticleColor(ev.clicks));
          scrollMesh.setColorAt(instanceIdx, _color);
          instanceIdx += 1;
        }
        scrollMesh.count = instanceIdx;
        scrollMesh.instanceMatrix.needsUpdate = true;
        if (scrollMesh.instanceColor) scrollMesh.instanceColor.needsUpdate = true;

        return needsMoreFrames;
      };

      const renderFrame = () => {
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame(() => {
          renderDirty = false;
          const now = performance.now();
          const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
          lastNow = now;

          controls.update();
          const keepGoing = stepScene(dt);
          renderer.render(scene, camera);

          const finish = () => {
            renderBusy = false;
            if (renderDirty || keepGoing) {
              requestRender();
            }
          };

          if (isSoftwareGl) {
            afterDraw(finish);
          } else {
            finish();
          }
        });
      };

      const requestRender = () => {
        renderFrame();
      };
      requestRenderRef.current = requestRender;
      requestRender();

      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('webglcontextlost', handleLost);
        canvas.removeEventListener('webglcontextrestored', handleRestored);
        controls.dispose();
        envTex.dispose();
        groundGeo.dispose();
        triggerLineGeo.dispose();
        noteBlockGeo.dispose();
        baseBlockGeo.dispose();
        plinthGeo.dispose();
        ringGeo.dispose();
        repeaterBaseGeo.dispose();
        torchGeo.dispose();
        scrollGeo.dispose();
        scrollMat.dispose();
        particleGeo.dispose();
        particles.forEach((p) => p.mat.dispose());
        disposableTextures.forEach((t) => t.dispose());
        disposableMaterials.forEach((m) => m.dispose());
        renderer.dispose();
      };
    }, []);

    const applyPreset = (next: CameraPreset) => {
      setPreset(next);
      const view = PRESET_VIEWS[next];
      cameraTargetPresetRef.current.pos.set(...view.pos);
      cameraTargetPresetRef.current.target.set(...view.target);
      cameraTargetPresetRef.current.active = true;
      requestRenderRef.current?.();
    };

    return (
      <div className="relative h-[340px] w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 sm:h-[390px]">
        {contextLost ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-900 p-6 text-center text-slate-300">
            <p className="text-sm font-medium">3D Viewport context suspended</p>
            <p className="text-xs text-slate-400">
              Scores, playback, and build exports remain active below.
            </p>
          </div>
        ) : (
          <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
        )}

        {/* Top-left semantic HUD caption */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-[calc(100%-24px)] rounded-lg border border-white/10 bg-slate-950/85 px-3 py-1.5 text-xs text-slate-200">
          <span className="font-medium text-emerald-400">3D Redstone Stage</span>
          <span className="mx-2 text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-300">{inspected}</span>
        </div>

        {/* Bottom-center compact camera preset bar */}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-white/10 bg-slate-950/90 p-1">
          <button
            type="button"
            onClick={() => applyPreset('iso')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              preset === 'iso'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            Isometric
          </button>
          <button
            type="button"
            onClick={() => applyPreset('front')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              preset === 'front'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Front
          </button>
          <button
            type="button"
            onClick={() => applyPreset('top')}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              preset === 'top'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Top Track
          </button>
          <button
            type="button"
            onClick={() => applyPreset(preset)}
            aria-label="Reset camera view"
            className="inline-flex items-center rounded-md px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  },
);
