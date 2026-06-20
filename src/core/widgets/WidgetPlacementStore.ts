import { defineStore } from "pinia";
import { ref, type Ref } from "vue";

import { activeProfileKvNamespace } from "~/core/profile/storageScope";
import { createKvBackedStore } from "~/core/storage/createKvBackedStore";
import { WIDGETS_KV_NAMESPACE, WIDGETS_KV_PRIMARY_KEY } from "~/core/storage/constants";
import { WIDGET_GRID_GAP_UNITS, WIDGET_SIZE_GRID_UNITS } from "~/core/widgets/sizing";
import type { WidgetShellScope, WidgetSize } from "~/types/widget";

export interface WidgetPlacement {
  gridX: number;
  gridY: number;
}

export interface WidgetGridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type WidgetScopedEnabledState = Record<WidgetShellScope, Record<string, boolean>>;

interface WidgetPlacementState {
  placements: Record<string, WidgetPlacement>;
  enabled: WidgetScopedEnabledState;
}

interface WidgetPlacementCoerceResult {
  state: WidgetPlacementState;
  migrated: boolean;
}

interface WidgetPlacementHydrateOptions {
  storageNamespace?: string;
}

function emptyEnabledState(): WidgetScopedEnabledState {
  return { desktop: {}, mobile: {} };
}

function emptyState(): WidgetPlacementState {
  return { placements: {}, enabled: emptyEnabledState() };
}

const DEFAULT_STATE: WidgetPlacementState = emptyState();

const CLOCK_WIDGET_ID_ALIASES = {
  placements: {
    "desktop:big-clock": "clock:desktop-big",
  },
  enabled: {
    "status:clock": "clock:menubar",
    "desktop:big-clock": "clock:desktop-big",
    "mobile:big-clock": "clock:mobile-big",
  },
} as const;

function coercePlacements(raw: unknown): Record<string, WidgetPlacement> {
  if (typeof raw !== "object" || raw === null) return {};
  const cleaned: Record<string, WidgetPlacement> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof value !== "object" || value === null) continue;
    const placement = value as Partial<WidgetPlacement>;
    if (
      typeof placement.gridX !== "number" ||
      !Number.isFinite(placement.gridX) ||
      typeof placement.gridY !== "number" ||
      !Number.isFinite(placement.gridY)
    ) {
      continue;
    }
    cleaned[id] = {
      gridX: Math.max(0, Math.floor(placement.gridX)),
      gridY: Math.max(0, Math.floor(placement.gridY)),
    };
  }
  return cleaned;
}

function coerceEnabledMap(raw: unknown): Record<string, boolean> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const cleaned: Record<string, boolean> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof value !== "boolean") continue;
    cleaned[id] = value;
  }
  return cleaned;
}

function coerceEnabled(raw: unknown): WidgetScopedEnabledState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return emptyEnabledState();
  }

  const candidate = raw as Partial<Record<WidgetShellScope, unknown>>;
  const hasScopedShape = "desktop" in candidate || "mobile" in candidate;
  if (hasScopedShape) {
    return {
      desktop: coerceEnabledMap(candidate.desktop),
      mobile: coerceEnabledMap(candidate.mobile),
    };
  }

  const legacy = coerceEnabledMap(raw);
  return {
    desktop: { ...legacy },
    mobile: { ...legacy },
  };
}

function migrateRecordKeys<T>(
  source: Record<string, T>,
  aliases: Readonly<Record<string, string>>,
): { value: Record<string, T>; migrated: boolean } {
  let migrated = false;
  const next: Record<string, T> = { ...source };

  for (const [oldId, newId] of Object.entries(aliases)) {
    if (!(oldId in next)) continue;
    if (!(newId in next)) {
      next[newId] = next[oldId];
    }
    delete next[oldId];
    migrated = true;
  }

  return { value: next, migrated };
}

function migrateClockWidgetAliases(state: WidgetPlacementState): WidgetPlacementCoerceResult {
  const placements = migrateRecordKeys(state.placements, CLOCK_WIDGET_ID_ALIASES.placements);
  const desktopEnabled = migrateRecordKeys(state.enabled.desktop, CLOCK_WIDGET_ID_ALIASES.enabled);
  const mobileEnabled = migrateRecordKeys(state.enabled.mobile, CLOCK_WIDGET_ID_ALIASES.enabled);

  return {
    state: {
      placements: placements.value,
      enabled: {
        desktop: desktopEnabled.value,
        mobile: mobileEnabled.value,
      },
    },
    migrated: placements.migrated || desktopEnabled.migrated || mobileEnabled.migrated,
  };
}

function coerceState(candidate: unknown): WidgetPlacementState {
  if (typeof candidate !== "object" || candidate === null) {
    return emptyState();
  }
  const c = candidate as Partial<WidgetPlacementState>;
  return {
    placements: coercePlacements(c.placements),
    enabled: coerceEnabled(c.enabled),
  };
}

function coerceAndMigrateState(candidate: unknown): WidgetPlacementCoerceResult {
  return migrateClockWidgetAliases(coerceState(candidate));
}

function clampGridUnit(value: number, min: number, max: number): number {
  if (max < min) return min;
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}

function rectViolatesGap(
  candidate: WidgetGridRect,
  occupied: WidgetGridRect,
  gapUnits = WIDGET_GRID_GAP_UNITS,
): boolean {
  return (
    candidate.x < occupied.x + occupied.w + gapUnits &&
    candidate.x + candidate.w + gapUnits > occupied.x &&
    candidate.y < occupied.y + occupied.h + gapUnits &&
    candidate.y + candidate.h + gapUnits > occupied.y
  );
}

function widgetGridRectViolatesGap(
  candidate: WidgetGridRect,
  occupied: ReadonlyArray<WidgetGridRect>,
  gapUnits = WIDGET_GRID_GAP_UNITS,
): boolean {
  return occupied.some((rect) => rectViolatesGap(candidate, rect, gapUnits));
}

function placementToRect(size: WidgetSize, placement: WidgetPlacement): WidgetGridRect {
  const dims = WIDGET_SIZE_GRID_UNITS[size];
  return { x: placement.gridX, y: placement.gridY, w: dims.w, h: dims.h };
}

export function autoPlace(
  size: WidgetSize,
  occupied: ReadonlyArray<WidgetGridRect>,
  viewportColumns: number,
  viewportRows: number,
): WidgetPlacement {
  const dims = WIDGET_SIZE_GRID_UNITS[size];
  const widthUnits = dims.w;
  const heightUnits = dims.h;

  for (let row = 0; row + heightUnits <= viewportRows; row += 1) {
    for (let col = viewportColumns - widthUnits; col >= 0; col -= 1) {
      const candidate = { x: col, y: row, w: widthUnits, h: heightUnits };
      if (!widgetGridRectViolatesGap(candidate, occupied)) {
        return { gridX: candidate.x, gridY: candidate.y };
      }
    }
  }

  return { gridX: 0, gridY: 0 };
}

export function resolveNearestFreeWidgetPlacement(
  size: WidgetSize,
  requested: WidgetPlacement,
  occupied: ReadonlyArray<WidgetGridRect>,
  viewportColumns: number,
  viewportRows: number,
): WidgetPlacement | undefined {
  const dims = WIDGET_SIZE_GRID_UNITS[size];
  if (viewportColumns < dims.w || viewportRows < dims.h) {
    return undefined;
  }

  const maxX = viewportColumns - dims.w;
  const maxY = viewportRows - dims.h;
  const target = {
    gridX: clampGridUnit(requested.gridX, 0, maxX),
    gridY: clampGridUnit(requested.gridY, 0, maxY),
  };

  let best: WidgetPlacement | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestDy = Number.POSITIVE_INFINITY;
  let bestDx = Number.POSITIVE_INFINITY;

  for (let row = 0; row <= maxY; row += 1) {
    for (let col = maxX; col >= 0; col -= 1) {
      const candidatePlacement = { gridX: col, gridY: row };
      const candidate = placementToRect(size, candidatePlacement);
      if (widgetGridRectViolatesGap(candidate, occupied)) {
        continue;
      }

      const dx = Math.abs(col - target.gridX);
      const dy = Math.abs(row - target.gridY);
      const score = dx * dx + dy * dy;
      const improvesDistance = score < bestScore;
      const improvesRowDistance = score === bestScore && dy < bestDy;
      const improvesColumnDistance = score === bestScore && dy === bestDy && dx < bestDx;
      const improvesStableTie =
        score === bestScore &&
        dy === bestDy &&
        dx === bestDx &&
        (best === undefined || row < best.gridY || (row === best.gridY && col > best.gridX));

      if (improvesDistance || improvesRowDistance || improvesColumnDistance || improvesStableTie) {
        best = candidatePlacement;
        bestScore = score;
        bestDy = dy;
        bestDx = dx;
      }
    }
  }

  return best;
}

export const useWidgetPlacementStore = defineStore("kernel-widget-placements", () => {
  const placements: Ref<Readonly<Record<string, WidgetPlacement>>> = ref({});
  const enabled: Ref<Readonly<WidgetScopedEnabledState>> = ref(emptyEnabledState());

  function snapshot(): WidgetPlacementState {
    return {
      placements: { ...placements.value },
      enabled: {
        desktop: { ...enabled.value.desktop },
        mobile: { ...enabled.value.mobile },
      },
    };
  }

  const persistence = createKvBackedStore<WidgetPlacementState>({
    primaryKey: WIDGETS_KV_PRIMARY_KEY,
    version: 1,
    snapshot,
    onRemoteChange: () => {
      handleRemoteKvNotification();
    },
  });

  function applyState(next: WidgetPlacementState): void {
    persistence.runSuppressed(() => {
      placements.value = { ...next.placements };
      enabled.value = {
        desktop: { ...next.enabled.desktop },
        mobile: { ...next.enabled.mobile },
      };
    });
  }

  function handleRemoteKvNotification(): void {
    const raw = persistence.read();
    if (raw === null) {
      applyState(emptyState());
      return;
    }
    applyState(coerceAndMigrateState(raw).state);
  }

  function get(id: string): WidgetPlacement | undefined {
    return placements.value[id];
  }

  /**
   * Set or update the placement for a widget id. Coordinates MUST be
   * non-negative integers in grid units. Persists immediately (drops
   * are discrete; no debounce). Identity-checked: a no-op write
   * (same gridX + gridY) skips the persist call to avoid waking the
   * remote-change listener in other tabs.
   */
  function set(id: string, next: WidgetPlacement): void {
    if (!persistence.kv.value) return;

    const sanitized: WidgetPlacement = {
      gridX: Math.max(0, Math.floor(next.gridX)),
      gridY: Math.max(0, Math.floor(next.gridY)),
    };

    const existing = placements.value[id];
    if (
      existing !== undefined &&
      existing.gridX === sanitized.gridX &&
      existing.gridY === sanitized.gridY
    ) {
      return;
    }

    placements.value = { ...placements.value, [id]: sanitized };
    persistence.commit();
  }

  function remove(id: string): void {
    if (!persistence.kv.value) return;
    if (placements.value[id] === undefined) return;
    const next = { ...placements.value };
    delete next[id];
    placements.value = next;
    persistence.commit();
  }

  function list(): Readonly<Record<string, WidgetPlacement>> {
    return placements.value;
  }

  function isEnabled(scope: WidgetShellScope, id: string, defaultVisible = true): boolean {
    return enabled.value[scope][id] ?? defaultVisible;
  }

  function setEnabled(
    scope: WidgetShellScope,
    id: string,
    value: boolean,
    defaultVisible = true,
  ): void {
    if (!persistence.kv.value) return;

    const scopeMap = enabled.value[scope];
    const current = scopeMap[id]; // undefined | true | false
    const currentEffective = current ?? defaultVisible;
    if (currentEffective === value) return;

    let nextScopeMap: Record<string, boolean>;
    if (value === defaultVisible) {
      if (current === undefined) return;
      nextScopeMap = { ...scopeMap };
      delete nextScopeMap[id];
    } else {
      nextScopeMap = { ...scopeMap, [id]: value };
    }
    enabled.value = { ...enabled.value, [scope]: nextScopeMap };
    persistence.commit();
  }

  function listEnabled(scope: WidgetShellScope): Readonly<Record<string, boolean>> {
    return enabled.value[scope];
  }

  function hydrate(options?: WidgetPlacementHydrateOptions): void {
    persistence.start(options?.storageNamespace ?? activeProfileKvNamespace(WIDGETS_KV_NAMESPACE));

    const persisted = persistence.read();
    const loaded =
      persisted !== null
        ? coerceAndMigrateState(persisted)
        : { state: DEFAULT_STATE, migrated: false };

    applyState(loaded.state);
    if (loaded.migrated) {
      persistence.commit();
    }
  }

  function dispose(): void {
    persistence.dispose();
  }

  function isHydrated(): boolean {
    return persistence.kv.value !== undefined;
  }

  return {
    placements,
    enabled,
    get,
    set,
    remove,
    list,
    isEnabled,
    setEnabled,
    listEnabled,
    hydrate,
    isHydrated,
    dispose,
  };
});
