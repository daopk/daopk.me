import type { BufferGeometry, Material, PerspectiveCamera, Texture } from "three/webgpu";

import { loadThree, type ThreeModule } from "../../rendering/three";
import type {
  HtmlInCanvasSnapshot,
  HtmlInCanvasTransitionOrigin,
} from "../../transition/transitionController";
import {
  createHtmlInCanvasShardPolygons,
  defaultHtmlInCanvasShardCount,
  type HtmlInCanvasPoint,
  type HtmlInCanvasShardPolygon,
} from "./fracture";
import {
  createHtmlInCanvasShardColorSampler,
  nearestHtmlInCanvasShardNeighborColor,
} from "./color";
import {
  CAMERA_FOV_DEGREES,
  CRACK_BLOOM_WIDTH_PX,
  CRACK_CORE_LINE_WIDTH,
  CRACK_GLOW_WIDTH_PX,
  CRACK_Z_PX,
  DEFAULT_CONFIG,
  SHARD_DROP_CRACK_GLOW_MULTIPLIER,
  SHARD_DROP_EDGE_GLOW_BOOST,
  SHARD_DROP_MAX_MOMENTUM_PX,
  SHARD_DROP_MAX_ROTATION_MOMENTUM_RAD,
  SHARD_DROP_MOMENTUM_MS,
  SHARD_DROP_TAIL_ROTATION_RAD,
  SHARD_EDGE_EMISSIVE_BASE,
  SHARD_EDGE_POINTER_EMISSIVE_BOOST,
  SHARD_FLOAT_EDGE_OPACITY,
  SHARD_FLOAT_FRONT_OPACITY,
  SHARD_FLOAT_REFLECTION_OPACITY,
  SHARD_POINTER_LEAVE_AGE_MS,
  SHARD_POINTER_SMOOTH_MS,
  SHARD_POINTER_VELOCITY_FOR_FULL_WAKE,
  SHARD_REFLECTION_POINTER_BOOST_OPACITY,
} from "./config";
import {
  createHtmlInCanvasCrackRibbonGeometry,
  createHtmlInCanvasShardGeometry,
  localHtmlInCanvasShardCrackPoint,
} from "./geometry";
import type {
  CrackState,
  PointerWakeState,
  RendererState,
  ShardState,
  HtmlInCanvasActivationContext,
  HtmlInCanvasShardVector3,
} from "./state";
import type {
  HtmlInCanvasCrackVisualState,
  HtmlInCanvasPointerWake,
  HtmlInCanvasSampledColor,
  HtmlInCanvasShardOverlayConfig,
  HtmlInCanvasShardOverlayRunnerOptions,
  HtmlInCanvasShardRenderer,
} from "./types";
import {
  resolveHtmlInCanvasCrackPointerWake,
  resolveHtmlInCanvasPointerWakeIntensity,
  resolveHtmlInCanvasShardDropMaxDelayProgress,
  resolveHtmlInCanvasShardDropMotion,
  resolveHtmlInCanvasShardDropProgress,
  resolveHtmlInCanvasShardDropTailProgress,
  resolveHtmlInCanvasShardFloatProgress,
  resolveHtmlInCanvasShardHoverBlend,
  resolveHtmlInCanvasShardPointerReaction,
} from "./motion";
import {
  clamp,
  clampVectorLength,
  distanceBetween,
  easeOutCubic,
  lerp,
  mixColor,
  normalizeVector,
  smoothstep,
} from "./math";
import {
  resolveHtmlInCanvasCrackBackplateOpacity,
  resolveHtmlInCanvasCrackVisual,
  resolveHtmlInCanvasOverlayViewport,
  resolveHtmlInCanvasShardEdgeOpacity,
  resolveHtmlInCanvasShardReflectionColor,
} from "./visuals";

type Vector3 = HtmlInCanvasShardVector3;
type SampledColor = HtmlInCanvasSampledColor;

export async function createHtmlInCanvasShardRenderer(
  snapshot: HtmlInCanvasSnapshot,
  options: HtmlInCanvasShardOverlayRunnerOptions,
): Promise<HtmlInCanvasShardRenderer> {
  const config = resolvedConfig(options);
  const THREE = await (options.loadThreeModule ?? loadThree)();
  const image = await loadImage(snapshot.url, options.documentRef);
  const canvas = options.documentRef.createElement("canvas");
  const renderer = new THREE.WebGPURenderer({ canvas, alpha: true, antialias: true });
  try {
    await renderer.init();
  } catch (error) {
    renderer.dispose();
    throw error;
  }

  const texture = new THREE.Texture(image);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const camera = createCamera(THREE, snapshot.width, snapshot.height);
  const pointerWake = createPointerWakeState();
  let dropOrigin = { ...options.origin };
  const backplateMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const backplate = new THREE.Mesh(
    new THREE.PlaneGeometry(snapshot.width, snapshot.height),
    backplateMaterial,
  );
  const geometries: BufferGeometry[] = [backplate.geometry];
  const materials: Material[] = [backplateMaterial];
  const polygons = options.reducedMotion
    ? []
    : createHtmlInCanvasShardPolygons({
        width: snapshot.width,
        height: snapshot.height,
        seed: config.seed,
        targetShardCount:
          config.targetShardCount ?? defaultHtmlInCanvasShardCount(snapshot.width, snapshot.height),
        maxShardCount: config.maxShardCount,
        minShardAreaRatio: config.minShardAreaRatio,
      });
  const shards = options.reducedMotion
    ? []
    : createShardStates(
        THREE,
        snapshot,
        image,
        texture,
        config,
        polygons,
        options.origin,
        geometries,
        materials,
      );
  const cracks = options.reducedMotion
    ? []
    : createCrackStates(THREE, snapshot, polygons, shards, options.origin, geometries, materials);

  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.getMaxAnisotropy());
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(options.windowRef.devicePixelRatio || 1, config.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  canvas.className = "html-in-canvas-shard-overlay";
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.testid = "html-in-canvas-shard-overlay";
  canvas.style.cssText = [
    `block-size: ${snapshot.height}px`,
    "cursor: default",
    `inline-size: ${snapshot.width}px`,
    "inset: 0",
    "pointer-events: auto",
    "position: fixed",
    "touch-action: none",
    "visibility: hidden",
    "z-index: calc(var(--context-menu-z, 1700) + 380)",
  ].join(";");

  const onCanvasPointerMove = (event: PointerEvent): void => {
    updatePointerWakeFromEvent(pointerWake, event, snapshot, canvas, options.windowRef);
  };
  const onCanvasPointerLeave = (): void => {
    agePointerWakeAfterLeave(pointerWake, options.windowRef.performance.now());
  };

  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onCanvasPointerLeave, { passive: true });

  backplate.position.set(0, 0, 0);
  root.add(backplate);
  for (const shard of shards) {
    root.add(shard.mesh);
  }

  scene.add(root);
  scene.add(new THREE.AmbientLight(0xb9d9ff, 0.62));

  const keyLight = new THREE.DirectionalLight(0xf6fbff, 1.15);
  keyLight.position.set(-0.3, 0.5, 1);
  scene.add(keyLight);

  const colorLight = new THREE.PointLight(
    0x7ee9dc,
    1.6,
    Math.max(snapshot.width, snapshot.height) * 2.4,
  );
  colorLight.position.set(snapshot.width * 0.24, snapshot.height * 0.16, snapshot.height * 0.36);
  scene.add(colorLight);

  options.documentRef.body.append(canvas);

  const state: RendererState = {
    renderer,
    scene,
    camera,
    root,
    pointerWake,
    texture,
    backplate,
    backplateMaterial,
    shards,
    cracks,
    geometries,
    materials,
  };

  applyShardDropDelays(
    state.shards,
    snapshot,
    dropOrigin,
    resolveHtmlInCanvasShardDropMaxDelayProgress({ dropDurationMs: config.dropDurationMs }),
  );

  return {
    canvas,
    renderCover() {
      state.backplate.visible = true;
      state.backplateMaterial.opacity = 1;
      for (const shard of state.shards) {
        shard.mesh.visible = false;
        setShardPointerGlow(shard, 0);
      }
      for (const crack of state.cracks) {
        setCrackVisibility(crack, true);
        applyCrackVisual(crack, {
          coreOpacity: 0,
          glowOpacity: 0,
          bloomOpacity: 0,
          shimmerOpacity: 0,
        });
      }
      renderState(state, snapshot, config);
      canvas.style.visibility = "visible";
    },
    renderCrack(progress, timestamp) {
      state.backplate.visible = true;
      state.backplateMaterial.opacity = resolveHtmlInCanvasCrackBackplateOpacity(progress);
      const shardsVisible = progress > 0;
      for (const shard of state.shards) {
        const shardProgress = resolveHtmlInCanvasShardFloatProgress({
          activation: shard.activation,
          progress,
        });

        shard.mesh.visible = shardsVisible;
        setShardOpacity(shard, 1, resolveHtmlInCanvasShardEdgeOpacity(shardProgress));
        setShardPointerGlow(shard, 0);
        moveShardFloat(shard, shardProgress, timestamp);
      }
      for (const crack of state.cracks) {
        setCrackVisibility(crack, shardsVisible);
        applyCrackVisual(
          crack,
          resolveHtmlInCanvasCrackVisual({
            activation: crack.activation,
            originHeat: crack.originHeat,
            seed: crack.seed,
            progress,
            timestamp,
            waiting: false,
          }),
        );
      }
      renderState(state, snapshot, config);
    },
    renderFloat(progress, timestamp) {
      const crackFade = 1 - smoothstep(0.3, 1, progress) * 0.42;
      const pointerWake = resolvePointerWakeFrame(state.pointerWake, timestamp);
      state.backplate.visible = true;
      state.backplateMaterial.opacity = 0;
      for (const shard of state.shards) {
        shard.mesh.visible = true;
        setShardOpacity(
          shard,
          SHARD_FLOAT_FRONT_OPACITY,
          SHARD_FLOAT_EDGE_OPACITY,
          SHARD_FLOAT_REFLECTION_OPACITY,
        );
        hoverShard(shard, timestamp, pointerWake);
      }
      for (const crack of state.cracks) {
        setCrackVisibility(crack, true);
        applyCrackVisual(
          crack,
          resolveHtmlInCanvasCrackVisual({
            activation: crack.activation,
            originHeat: crack.originHeat,
            seed: crack.seed,
            progress: 1,
            timestamp,
            waiting: true,
          }),
          crackFade,
          resolveHtmlInCanvasCrackPointerWake({
            crackPosition: crackWorldPosition(crack),
            pointer: pointerWake,
          }),
        );
      }
      renderState(state, snapshot, config);
    },
    renderWaiting(timestamp) {
      const pointerWake = resolvePointerWakeFrame(state.pointerWake, timestamp);
      state.backplate.visible = true;
      state.backplateMaterial.opacity = 0;
      for (const shard of state.shards) {
        shard.mesh.visible = true;
        setShardOpacity(
          shard,
          SHARD_FLOAT_FRONT_OPACITY,
          SHARD_FLOAT_EDGE_OPACITY,
          SHARD_FLOAT_REFLECTION_OPACITY,
        );
        hoverShard(shard, timestamp, pointerWake);
      }
      for (const crack of state.cracks) {
        setCrackVisibility(crack, true);
        applyCrackVisual(
          crack,
          resolveHtmlInCanvasCrackVisual({
            activation: crack.activation,
            originHeat: crack.originHeat,
            seed: crack.seed,
            progress: 1,
            timestamp,
            waiting: true,
          }),
          0.58,
          resolveHtmlInCanvasCrackPointerWake({
            crackPosition: crackWorldPosition(crack),
            pointer: pointerWake,
          }),
        );
      }
      renderState(state, snapshot, config);
    },
    renderDrop(progress, timestamp) {
      state.backplate.visible = true;
      state.backplateMaterial.opacity = 0;
      for (const crack of state.cracks) {
        setCrackVisibility(crack, true);
        applyCrackVisual(
          crack,
          resolveHtmlInCanvasCrackVisual({
            activation: crack.activation,
            originHeat: crack.originHeat,
            seed: crack.seed,
            progress: 1,
            timestamp,
            waiting: true,
          }),
          SHARD_DROP_CRACK_GLOW_MULTIPLIER,
        );
      }
      for (const shard of state.shards) {
        const shardProgress = resolveHtmlInCanvasShardDropProgress({
          delay: shard.dropDelayProgress,
          duration: shard.dropDurationProgress,
          progress,
        });
        const tailProgress = resolveHtmlInCanvasShardDropTailProgress({
          delay: shard.dropDelayProgress,
          duration: shard.dropDurationProgress,
          progress,
        });

        shard.mesh.visible = true;
        if (shardProgress <= 0 && progress < shard.dropDelayProgress) {
          setShardOpacity(
            shard,
            SHARD_FLOAT_FRONT_OPACITY,
            SHARD_FLOAT_EDGE_OPACITY,
            SHARD_FLOAT_REFLECTION_OPACITY,
          );
          hoverShard(shard, timestamp, null);
          setShardPointerGlow(shard, SHARD_DROP_EDGE_GLOW_BOOST);
          continue;
        }
        setShardOpacity(shard, 1 - smoothstep(0.68, 1, shardProgress), SHARD_FLOAT_EDGE_OPACITY);
        moveShardDrop(shard, shardProgress, tailProgress);
        setShardPointerGlow(shard, SHARD_DROP_EDGE_GLOW_BOOST);
      }
      renderState(state, snapshot, config);
    },
    renderReduced(progress) {
      state.backplate.visible = true;
      state.backplateMaterial.opacity = 1 - easeOutCubic(progress);
      for (const shard of state.shards) {
        shard.mesh.visible = false;
        setShardPointerGlow(shard, 0);
      }
      for (const crack of state.cracks) {
        setCrackVisibility(crack, false);
      }
      renderState(state, snapshot, config);
    },
    setDropOrigin(origin) {
      dropOrigin = {
        x: clamp(origin.x, 0, snapshot.width),
        y: clamp(origin.y, 0, snapshot.height),
      };
      applyShardDropDelays(
        state.shards,
        snapshot,
        dropOrigin,
        resolveHtmlInCanvasShardDropMaxDelayProgress({ dropDurationMs: config.dropDurationMs }),
      );
    },
    dispose() {
      canvas.removeEventListener("pointermove", onCanvasPointerMove);
      canvas.removeEventListener("pointerleave", onCanvasPointerLeave);
      for (const geometry of state.geometries) {
        geometry.dispose();
      }
      for (const material of state.materials) {
        material.dispose();
      }
      state.texture.dispose();
      state.scene.clear();
      state.renderer.dispose();
      canvas.remove();
    },
  };
}

function createShardStates(
  THREE: ThreeModule,
  snapshot: HtmlInCanvasSnapshot,
  image: HTMLImageElement,
  texture: Texture,
  config: HtmlInCanvasShardOverlayConfig,
  polygons: readonly HtmlInCanvasShardPolygon[],
  origin: HtmlInCanvasTransitionOrigin,
  geometries: BufferGeometry[],
  materials: Material[],
): readonly ShardState[] {
  const sampler = createHtmlInCanvasShardColorSampler(image, snapshot.width, snapshot.height);
  const colors = polygons.map((polygon) => sampler.sample(polygon));
  const activationContext = createHtmlInCanvasActivationContext(snapshot, origin);

  return polygons.map((polygon, index) => {
    const ownColor = colors[index]!;
    const neighborColor = nearestHtmlInCanvasShardNeighborColor(index, polygons, colors);
    const reflectionColor = resolveHtmlInCanvasShardReflectionColor({
      ownColor,
      neighborColor,
      point: polygon.centroid,
      width: snapshot.width,
      height: snapshot.height,
    });
    const geometry = createHtmlInCanvasShardGeometry(
      THREE,
      polygon,
      snapshot.width,
      snapshot.height,
    );
    const frontMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    });
    const reflectionMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: colorFromSample(THREE, reflectionColor),
      depthWrite: false,
      opacity: 0,
      side: THREE.FrontSide,
      transparent: true,
      toneMapped: false,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      emissive: colorFromSample(THREE, mixColor(ownColor, neighborColor, 0.64)),
      emissiveIntensity: SHARD_EDGE_EMISSIVE_BASE,
      metalness: 0.46,
      roughness: 0.24,
      transparent: true,
      opacity: 0.96,
    });
    const mesh = new THREE.Mesh(geometry, [frontMaterial, edgeMaterial, reflectionMaterial]);
    const home = screenToWorld(polygon.centroid, snapshot.width, snapshot.height, 0);
    const activation = htmlInCanvasActivationForPolygon(activationContext, polygon);
    const outward = normalizeVector({
      x: home.x,
      y: home.y,
      z: 0,
    });
    const random = createShardRandom(config.seed + index * 977);
    const distance = 24 + random() * 76;
    const depth = 52 + random() * 150;
    const floatTarget = {
      x: home.x + outward.x * distance + (random() - 0.5) * 44,
      y: home.y + outward.y * distance + (random() - 0.5) * 42,
      z: depth,
    };
    const dropTarget = {
      x: floatTarget.x + outward.x * (48 + random() * 180) + (random() - 0.5) * 90,
      y: floatTarget.y - snapshot.height * (0.78 + random() * 0.86),
      z: floatTarget.z - 120 + random() * 260,
    };
    const floatRotation = {
      x: (random() - 0.5) * 0.46,
      y: (random() - 0.5) * 0.52,
      z: (random() - 0.5) * 0.28,
    };
    const dropRotation = {
      x: floatRotation.x + (random() - 0.5) * 3.8,
      y: floatRotation.y + (random() - 0.5) * 4.2,
      z: floatRotation.z + (random() - 0.5) * 2.8,
    };
    const floatSeed = random();
    const dropExitTarget = {
      x: dropTarget.x + (floatSeed - 0.5) * 120,
      y: dropTarget.y - snapshot.height * (0.85 + floatSeed * 0.3),
      z: dropTarget.z - 90 - floatSeed * 80,
    };

    mesh.position.set(home.x, home.y, home.z);
    mesh.renderOrder = index + 1;
    geometries.push(geometry);
    materials.push(frontMaterial, edgeMaterial, reflectionMaterial);

    return {
      mesh,
      frontMaterial,
      edgeMaterial,
      reflectionMaterial,
      activation,
      home,
      floatTarget,
      dropTarget,
      dropExitTarget,
      floatRotation,
      dropRotation,
      floatSeed,
      motionVelocity: { x: 0, y: 0, z: 0 },
      motionRotationVelocity: { x: 0, y: 0, z: 0 },
      dropMomentum: { x: 0, y: 0, z: 0 },
      dropRotationMomentum: { x: 0, y: 0, z: 0 },
      dropDurationProgress: 1,
      dropDelayProgress: 0,
      dropStart: null,
      dropStartRotation: null,
      motionLastAt: null,
      reflectionBaseOpacity: 0,
    };
  });
}

function createCrackStates(
  THREE: ThreeModule,
  snapshot: HtmlInCanvasSnapshot,
  polygons: readonly HtmlInCanvasShardPolygon[],
  shards: readonly ShardState[],
  origin: HtmlInCanvasTransitionOrigin,
  geometries: BufferGeometry[],
  materials: Material[],
): readonly CrackState[] {
  const activationContext = createHtmlInCanvasActivationContext(snapshot, origin);
  const cracks: CrackState[] = [];
  let edgeIndex = 0;

  for (const [polygonIndex, polygon] of polygons.entries()) {
    const shard = shards[polygonIndex];
    if (shard === undefined) {
      continue;
    }

    for (let index = 0; index < polygon.points.length; index++) {
      const current = polygon.points[index]!;
      const next = polygon.points[(index + 1) % polygon.points.length]!;
      const midpoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
      };
      const start = localHtmlInCanvasShardCrackPoint(current, polygon);
      const end = localHtmlInCanvasShardCrackPoint(next, polygon);
      const localMidpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        z: CRACK_Z_PX,
      };
      const activation = htmlInCanvasActivationForPoint(activationContext, midpoint);
      const originHeat = 1 - smoothstep(0.03, 0.34, activation);
      const seed = polygon.seed + edgeIndex * 0.013;
      const color = edgeIndex % 11 === 0 ? 0xfff3cc : edgeIndex % 5 === 0 ? 0xb794ff : 0x7ee9dc;
      const coreGeometry = new THREE.BufferGeometry();
      const glowGeometry = createHtmlInCanvasCrackRibbonGeometry(
        THREE,
        start,
        end,
        CRACK_GLOW_WIDTH_PX,
        CRACK_Z_PX - 0.1,
      );
      const bloomGeometry = createHtmlInCanvasCrackRibbonGeometry(
        THREE,
        start,
        end,
        CRACK_BLOOM_WIDTH_PX,
        CRACK_Z_PX - 0.35,
      );
      const coreMaterial = new THREE.LineBasicMaterial({
        blending: THREE.AdditiveBlending,
        color,
        depthTest: false,
        depthWrite: false,
        linewidth: CRACK_CORE_LINE_WIDTH,
        opacity: 0,
        transparent: true,
      });
      const glowMaterial = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color,
        depthTest: false,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
        transparent: true,
        toneMapped: false,
      });
      const bloomMaterial = new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color,
        depthTest: false,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
        transparent: true,
        toneMapped: false,
      });
      const shimmerMaterial =
        edgeIndex % 7 === 0
          ? new THREE.LineBasicMaterial({
              blending: THREE.AdditiveBlending,
              color: 0xfff7d2,
              depthTest: false,
              depthWrite: false,
              linewidth: CRACK_CORE_LINE_WIDTH,
              opacity: 0,
              transparent: true,
            })
          : null;
      coreGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([start.x, start.y, start.z, end.x, end.y, end.z], 3),
      );
      const core = new THREE.LineSegments(coreGeometry, coreMaterial);
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      const bloom = new THREE.Mesh(bloomGeometry, bloomMaterial);
      const shimmer =
        shimmerMaterial === null
          ? null
          : new THREE.LineSegments(coreGeometry.clone(), shimmerMaterial);

      core.frustumCulled = false;
      glow.frustumCulled = false;
      bloom.frustumCulled = false;
      core.renderOrder = 1100 + edgeIndex;
      glow.renderOrder = 1000 + edgeIndex;
      bloom.renderOrder = 900 + edgeIndex;
      if (shimmer !== null) {
        shimmer.frustumCulled = false;
        shimmer.renderOrder = 1200 + edgeIndex;
      }
      shard.mesh.add(bloom, glow, core);
      if (shimmer !== null) {
        shard.mesh.add(shimmer);
      }
      geometries.push(coreGeometry, glowGeometry, bloomGeometry);
      materials.push(coreMaterial, glowMaterial, bloomMaterial);
      if (shimmer !== null && shimmerMaterial !== null) {
        geometries.push(shimmer.geometry);
        materials.push(shimmerMaterial);
      }
      cracks.push({
        shard,
        localMidpoint,
        core,
        glow,
        bloom,
        shimmer,
        coreMaterial,
        glowMaterial,
        bloomMaterial,
        shimmerMaterial,
        activation,
        originHeat,
        seed,
      });
      edgeIndex++;
    }
  }

  return cracks;
}

function createCamera(THREE: ThreeModule, width: number, height: number): PerspectiveCamera {
  const distance = cameraDistanceForHeight(height);
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    width / height,
    0.1,
    distance + Math.max(width, height) * 3,
  );

  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);

  return camera;
}

function renderState(
  state: RendererState,
  snapshot: HtmlInCanvasSnapshot,
  config: HtmlInCanvasShardOverlayConfig,
): void {
  const { width, height, pixelRatio } = resolveHtmlInCanvasOverlayViewport(snapshot, config);

  state.renderer.setPixelRatio(pixelRatio);
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.root.scale.set(1, 1, 1);
  state.renderer.render(state.scene, state.camera);
}

function moveShardFloat(shard: ShardState, progress: number, timestamp?: number): void {
  const hover = timestamp === undefined ? 0 : resolveHtmlInCanvasShardHoverBlend(progress);
  const hoverMotion =
    hover > 0 && timestamp !== undefined ? shardHoverMotion(shard, timestamp) : null;

  setShardPose(
    shard,
    {
      x: lerp(shard.home.x, shard.floatTarget.x, progress) + (hoverMotion?.position.x ?? 0) * hover,
      y: lerp(shard.home.y, shard.floatTarget.y, progress) + (hoverMotion?.position.y ?? 0) * hover,
      z: lerp(shard.home.z, shard.floatTarget.z, progress) + (hoverMotion?.position.z ?? 0) * hover,
    },
    {
      x: lerp(0, shard.floatRotation.x, progress) + (hoverMotion?.rotation.x ?? 0) * hover,
      y: lerp(0, shard.floatRotation.y, progress) + (hoverMotion?.rotation.y ?? 0) * hover,
      z: lerp(0, shard.floatRotation.z, progress) + (hoverMotion?.rotation.z ?? 0) * hover,
    },
    timestamp,
  );
}

function hoverShard(
  shard: ShardState,
  timestamp: number,
  pointerWake: HtmlInCanvasPointerWake | null,
): void {
  const hoverMotion = shardHoverMotion(shard, timestamp);
  const basePosition = {
    x: shard.floatTarget.x + hoverMotion.position.x,
    y: shard.floatTarget.y + hoverMotion.position.y,
    z: shard.floatTarget.z + hoverMotion.position.z,
  };
  const baseRotation = {
    x: shard.floatRotation.x + hoverMotion.rotation.x,
    y: shard.floatRotation.y + hoverMotion.rotation.y,
    z: shard.floatRotation.z + hoverMotion.rotation.z,
  };
  const pointerReaction = resolveHtmlInCanvasShardPointerReaction({
    shardPosition: basePosition,
    pointer: pointerWake,
  });

  setShardPose(
    shard,
    {
      x: basePosition.x + pointerReaction.position.x,
      y: basePosition.y + pointerReaction.position.y,
      z: basePosition.z + pointerReaction.position.z,
    },
    {
      x: baseRotation.x + pointerReaction.rotation.x,
      y: baseRotation.y + pointerReaction.rotation.y,
      z: baseRotation.z + pointerReaction.rotation.z,
    },
    timestamp,
  );
  setShardPointerGlow(shard, pointerReaction.glowBoost);
}

function shardHoverMotion(
  shard: ShardState,
  timestamp: number,
): {
  readonly position: Vector3;
  readonly rotation: Vector3;
} {
  const slow = timestamp * 0.0012 + shard.floatSeed * Math.PI * 2;
  const quick = timestamp * 0.0021 + shard.floatSeed * Math.PI * 5;

  return {
    position: {
      x: Math.sin(slow) * 4.2,
      y: Math.cos(quick) * 5.8,
      z: Math.sin(quick) * 8,
    },
    rotation: {
      x: Math.sin(quick) * 0.045,
      y: Math.cos(slow) * 0.052,
      z: Math.sin(slow) * 0.038,
    },
  };
}

function createPointerWakeState(): PointerWakeState {
  return {
    current: null,
    target: null,
    lastFrameAt: null,
    lastMovedAt: Number.NEGATIVE_INFINITY,
    velocity: 0,
  };
}

function updatePointerWakeFromEvent(
  state: PointerWakeState,
  event: PointerEvent,
  snapshot: HtmlInCanvasSnapshot,
  canvas: HTMLCanvasElement,
  windowRef: Window,
): void {
  if (event.pointerType === "touch") {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const point = {
    x: clamp(((event.clientX - rect.left) / rect.width) * snapshot.width, 0, snapshot.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * snapshot.height, 0, snapshot.height),
  };
  const target = screenToWorld(point, snapshot.width, snapshot.height, 0);
  const now = windowRef.performance.now();

  if (state.target !== null) {
    const elapsed = Math.max(1, now - state.lastMovedAt);
    const distance = Math.hypot(target.x - state.target.x, target.y - state.target.y);
    const velocity = clamp(distance / elapsed / SHARD_POINTER_VELOCITY_FOR_FULL_WAKE, 0, 1);

    state.velocity = lerp(state.velocity, velocity, 0.42);
  } else {
    state.velocity = 0.18;
  }

  state.target = { x: target.x, y: target.y, z: target.z };
  state.current ??= { x: target.x, y: target.y, z: target.z };
  state.lastMovedAt = now;
}

function agePointerWakeAfterLeave(state: PointerWakeState, now: number): void {
  if (state.target === null) {
    return;
  }

  state.lastMovedAt = Math.min(state.lastMovedAt, now - SHARD_POINTER_LEAVE_AGE_MS);
  state.velocity = 0;
}

function resolvePointerWakeFrame(
  state: PointerWakeState,
  timestamp: number,
): HtmlInCanvasPointerWake | null {
  if (state.current === null || state.target === null) {
    return null;
  }

  const elapsed = state.lastFrameAt === null ? 16 : clamp(timestamp - state.lastFrameAt, 0, 48);
  const blend = 1 - Math.exp(-elapsed / SHARD_POINTER_SMOOTH_MS);

  state.current.x = lerp(state.current.x, state.target.x, blend);
  state.current.y = lerp(state.current.y, state.target.y, blend);
  state.current.z = lerp(state.current.z, state.target.z, blend);
  state.lastFrameAt = timestamp;

  const age = Math.max(0, timestamp - state.lastMovedAt);
  const velocity = clamp(state.velocity, 0, 1);
  const intensity = resolveHtmlInCanvasPointerWakeIntensity(age, velocity);

  if (intensity <= 0.001) {
    return null;
  }

  return {
    position: {
      x: state.current.x,
      y: state.current.y,
      z: state.current.z,
    },
    intensity,
    velocity,
  };
}

function crackWorldPosition(crack: CrackState): Vector3 {
  return {
    x: crack.shard.mesh.position.x + crack.localMidpoint.x,
    y: crack.shard.mesh.position.y + crack.localMidpoint.y,
    z: crack.shard.mesh.position.z + crack.localMidpoint.z,
  };
}

function setShardPose(
  shard: ShardState,
  position: Vector3,
  rotation: Vector3,
  timestamp?: number,
): void {
  if (timestamp !== undefined) {
    recordShardMotion(shard, position, rotation, timestamp);
  }

  shard.mesh.position.set(position.x, position.y, position.z);
  shard.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
}

function recordShardMotion(
  shard: ShardState,
  position: Vector3,
  rotation: Vector3,
  timestamp: number,
): void {
  if (shard.motionLastAt !== null) {
    const elapsed = clamp(timestamp - shard.motionLastAt, 1, 80);
    const nextVelocity = {
      x: (position.x - shard.mesh.position.x) / elapsed,
      y: (position.y - shard.mesh.position.y) / elapsed,
      z: (position.z - shard.mesh.position.z) / elapsed,
    };
    const nextRotationVelocity = {
      x: (rotation.x - shard.mesh.rotation.x) / elapsed,
      y: (rotation.y - shard.mesh.rotation.y) / elapsed,
      z: (rotation.z - shard.mesh.rotation.z) / elapsed,
    };

    shard.motionVelocity.x = lerp(shard.motionVelocity.x, nextVelocity.x, 0.46);
    shard.motionVelocity.y = lerp(shard.motionVelocity.y, nextVelocity.y, 0.46);
    shard.motionVelocity.z = lerp(shard.motionVelocity.z, nextVelocity.z, 0.46);
    shard.motionRotationVelocity.x = lerp(
      shard.motionRotationVelocity.x,
      nextRotationVelocity.x,
      0.46,
    );
    shard.motionRotationVelocity.y = lerp(
      shard.motionRotationVelocity.y,
      nextRotationVelocity.y,
      0.46,
    );
    shard.motionRotationVelocity.z = lerp(
      shard.motionRotationVelocity.z,
      nextRotationVelocity.z,
      0.46,
    );
  }

  shard.motionLastAt = timestamp;
}

function captureShardDropStart(shard: ShardState): void {
  if (shard.dropStart !== null && shard.dropStartRotation !== null) {
    return;
  }

  shard.dropStart = {
    x: shard.mesh.position.x,
    y: shard.mesh.position.y,
    z: shard.mesh.position.z,
  };
  shard.dropStartRotation = {
    x: shard.mesh.rotation.x,
    y: shard.mesh.rotation.y,
    z: shard.mesh.rotation.z,
  };
  const positionMomentum = clampVectorLength(
    {
      x: shard.motionVelocity.x * SHARD_DROP_MOMENTUM_MS,
      y: shard.motionVelocity.y * SHARD_DROP_MOMENTUM_MS,
      z: shard.motionVelocity.z * SHARD_DROP_MOMENTUM_MS,
    },
    SHARD_DROP_MAX_MOMENTUM_PX,
  );
  const rotationMomentum = clampVectorLength(
    {
      x: shard.motionRotationVelocity.x * SHARD_DROP_MOMENTUM_MS,
      y: shard.motionRotationVelocity.y * SHARD_DROP_MOMENTUM_MS,
      z: shard.motionRotationVelocity.z * SHARD_DROP_MOMENTUM_MS,
    },
    SHARD_DROP_MAX_ROTATION_MOMENTUM_RAD,
  );

  shard.dropMomentum.x = positionMomentum.x;
  shard.dropMomentum.y = positionMomentum.y;
  shard.dropMomentum.z = positionMomentum.z;
  shard.dropRotationMomentum.x = rotationMomentum.x;
  shard.dropRotationMomentum.y = rotationMomentum.y;
  shard.dropRotationMomentum.z = rotationMomentum.z;
}

function applyShardDropDelays(
  shards: readonly ShardState[],
  snapshot: HtmlInCanvasSnapshot,
  origin: HtmlInCanvasTransitionOrigin,
  maxDelayProgress: number,
): void {
  const source = screenToWorld(origin, snapshot.width, snapshot.height, 0);
  const distances = shards.map((shard) =>
    Math.hypot(shard.mesh.position.x - source.x, shard.mesh.position.y - source.y),
  );
  const maxDistance = Math.max(1, ...distances);

  for (let index = 0; index < shards.length; index++) {
    const shard = shards[index]!;
    const distanceRatio = clamp((distances[index] ?? 0) / maxDistance, 0, 1);

    shard.dropDelayProgress = smoothstep(0, 1, distanceRatio) * maxDelayProgress;
    shard.dropDurationProgress = maxDelayProgress;
    shard.dropStart = null;
    shard.dropStartRotation = null;
  }
}

function moveShardDrop(shard: ShardState, progress: number, tailProgress: number): void {
  captureShardDropStart(shard);

  const basePosition = resolveHtmlInCanvasShardDropMotion({
    start: shard.dropStart ?? shard.floatTarget,
    target: shard.dropTarget,
    momentum: shard.dropMomentum,
    progress,
  });
  const baseRotation = resolveHtmlInCanvasShardDropMotion({
    start: shard.dropStartRotation ?? shard.floatRotation,
    target: shard.dropRotation,
    momentum: shard.dropRotationMomentum,
    progress,
  });
  const tail = smoothstep(0, 1, tailProgress);
  const position = {
    x: lerp(basePosition.x, shard.dropExitTarget.x, tail),
    y: lerp(basePosition.y, shard.dropExitTarget.y, tail),
    z: lerp(basePosition.z, shard.dropExitTarget.z, tail),
  };
  const rotation = {
    x: baseRotation.x + shard.dropRotationMomentum.x * tail * 1.2,
    y: baseRotation.y + shard.dropRotationMomentum.y * tail * 1.2,
    z: baseRotation.z + (shard.dropRotationMomentum.z + SHARD_DROP_TAIL_ROTATION_RAD) * tail,
  };

  shard.mesh.position.set(position.x, position.y, position.z);
  shard.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
}

function setShardOpacity(
  shard: ShardState,
  opacity: number,
  edgeOpacity = opacity * 0.96,
  reflectionOpacity = 0,
): void {
  shard.frontMaterial.opacity = opacity;
  shard.frontMaterial.depthWrite = opacity >= 0.98;
  shard.edgeMaterial.opacity = edgeOpacity;
  shard.edgeMaterial.depthWrite = edgeOpacity >= 0.94;
  shard.reflectionBaseOpacity = reflectionOpacity;
  shard.reflectionMaterial.opacity = reflectionOpacity;
}

function setShardPointerGlow(shard: ShardState, glowBoost: number): void {
  shard.edgeMaterial.emissiveIntensity =
    SHARD_EDGE_EMISSIVE_BASE + glowBoost * SHARD_EDGE_POINTER_EMISSIVE_BOOST;
  shard.reflectionMaterial.opacity = clamp(
    shard.reflectionBaseOpacity + glowBoost * SHARD_REFLECTION_POINTER_BOOST_OPACITY,
    0,
    0.22,
  );
}

function setCrackVisibility(crack: CrackState, visible: boolean): void {
  crack.core.visible = visible;
  crack.glow.visible = visible;
  crack.bloom.visible = visible;
  if (crack.shimmer !== null) {
    crack.shimmer.visible = visible;
  }
}

function applyCrackVisual(
  crack: CrackState,
  visual: HtmlInCanvasCrackVisualState,
  multiplier = 1,
  pointerWake = 0,
): void {
  crack.coreMaterial.opacity = clamp(visual.coreOpacity * multiplier + pointerWake * 0.28, 0, 1);
  crack.glowMaterial.opacity = clamp(visual.glowOpacity * multiplier + pointerWake * 0.36, 0, 0.86);
  crack.bloomMaterial.opacity = clamp(
    visual.bloomOpacity * multiplier + pointerWake * 0.18,
    0,
    0.5,
  );
  if (crack.shimmerMaterial !== null) {
    crack.shimmerMaterial.opacity = clamp(
      visual.shimmerOpacity * multiplier + pointerWake * 0.24,
      0,
      0.82,
    );
  }
}

function screenToWorld(
  point: HtmlInCanvasPoint,
  width: number,
  height: number,
  z: number,
): Vector3 {
  return {
    x: point.x - width / 2,
    y: height / 2 - point.y,
    z,
  };
}

function createHtmlInCanvasActivationContext(
  snapshot: HtmlInCanvasSnapshot,
  origin: HtmlInCanvasTransitionOrigin,
): HtmlInCanvasActivationContext {
  const source = {
    x: clamp(origin.x, 0, snapshot.width),
    y: clamp(origin.y, 0, snapshot.height),
  };
  const maxDistance = Math.max(
    1,
    distanceBetween(source, { x: 0, y: 0 }),
    distanceBetween(source, { x: snapshot.width, y: 0 }),
    distanceBetween(source, { x: snapshot.width, y: snapshot.height }),
    distanceBetween(source, { x: 0, y: snapshot.height }),
  );

  return { source, maxDistance };
}

function htmlInCanvasActivationForPolygon(
  context: HtmlInCanvasActivationContext,
  polygon: HtmlInCanvasShardPolygon,
): number {
  let activation = htmlInCanvasActivationForPoint(context, polygon.centroid);

  for (let index = 0; index < polygon.points.length; index++) {
    const current = polygon.points[index]!;
    const next = polygon.points[(index + 1) % polygon.points.length]!;

    activation = Math.min(
      activation,
      htmlInCanvasActivationForPoint(context, {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
      }),
    );
  }

  return activation;
}

function htmlInCanvasActivationForPoint(
  context: HtmlInCanvasActivationContext,
  point: HtmlInCanvasPoint,
): number {
  return distanceBetween(context.source, point) / context.maxDistance;
}

function colorFromSample(THREE: ThreeModule, color: SampledColor) {
  return new THREE.Color(color.r, color.g, color.b);
}

function loadImage(url: string, documentRef: Document): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = documentRef.createElement("img");

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load the desktop snapshot."));
    image.src = url;

    if (image.complete && image.naturalWidth > 0) {
      resolve(image);
      return;
    }

    if (typeof image.decode === "function") {
      void image.decode().then(
        () => resolve(image),
        () => undefined,
      );
    }
  });
}

function resolvedConfig(
  options: HtmlInCanvasShardOverlayRunnerOptions,
): HtmlInCanvasShardOverlayConfig {
  return { ...DEFAULT_CONFIG, ...options.config };
}

function cameraDistanceForHeight(height: number): number {
  return height / (2 * Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360));
}

function createShardRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
