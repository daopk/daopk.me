function isRecord(value) {
  return typeof value === "object" && value !== null;
}

export function coerceBuild(value) {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export function currentAppBuild(catalog, appId) {
  if (!isRecord(catalog) || !Array.isArray(catalog.apps)) {
    return 0;
  }

  let current = 0;
  for (const entry of catalog.apps) {
    if (!isRecord(entry) || entry.id !== appId) {
      continue;
    }

    const build = coerceBuild(entry.build);
    if (build !== null) {
      current = Math.max(current, build);
    }
  }
  return current;
}

export function nextAppBuild(catalog, appId) {
  return currentAppBuild(catalog, appId) + 1;
}
