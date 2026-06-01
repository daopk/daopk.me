interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: readonly string[];
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parseSemver(version: string | undefined): ParsedSemver | null {
  if (version === undefined) {
    return null;
  }
  const match = SEMVER_PATTERN.exec(version);
  if (match === null) {
    return null;
  }
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    ...(prerelease === undefined ? {} : { prerelease: prerelease.split(".") }),
  };
}

function comparePrerelease(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
    if (leftNumber !== null && rightNumber !== null) {
      return Math.sign(leftNumber - rightNumber);
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftPart.localeCompare(rightPart);
  }

  return 0;
}

function compareSemver(left: ParsedSemver, right: ParsedSemver): number {
  if (left.major !== right.major) return Math.sign(left.major - right.major);
  if (left.minor !== right.minor) return Math.sign(left.minor - right.minor);
  if (left.patch !== right.patch) return Math.sign(left.patch - right.patch);
  return comparePrerelease(left.prerelease, right.prerelease);
}

function normalizeBuild(build: number | undefined): number {
  return build !== undefined && Number.isSafeInteger(build) && build >= 0 ? build : 0;
}

export function isFirstPartyUpdateVersion(
  currentVersion: string | undefined,
  candidateVersion: string,
  currentBuild?: number,
  candidateBuild?: number,
): boolean {
  const current = parseSemver(currentVersion);
  const candidate = parseSemver(candidateVersion);
  if (current === null || candidate === null) {
    return false;
  }
  const versionComparison = compareSemver(candidate, current);
  if (versionComparison !== 0) {
    return versionComparison > 0;
  }
  return normalizeBuild(candidateBuild) > normalizeBuild(currentBuild);
}

export function formatFirstPartyReleaseLabel(
  version: string | undefined,
  build: number | undefined,
): string {
  if (version === undefined || version.length === 0) {
    return "No version";
  }
  const normalizedBuild = normalizeBuild(build);
  return normalizedBuild > 0 ? `v${version}+${normalizedBuild}` : `v${version}`;
}
