import type { Kernel } from "~/types/kernel";

type MobileSessionHandleOwner = (handleId: string) => boolean;

interface PendingHandleClaim {
  readonly manifestId: string;
  readonly settled: Promise<void>;
}

// Kept outside useMobileSession.ts so session replacements created by that
// module's HMR boundary still coordinate ownership through the same registry.
const handleOwnersByKernel = new WeakMap<Kernel, Set<MobileSessionHandleOwner>>();
const pendingClaimsByKernel = new WeakMap<Kernel, Set<PendingHandleClaim>>();

export function registerMobileSessionHandleOwner(
  kernel: Kernel,
  owner: MobileSessionHandleOwner,
): () => void {
  const owners = handleOwnersByKernel.get(kernel) ?? new Set<MobileSessionHandleOwner>();
  owners.add(owner);
  handleOwnersByKernel.set(kernel, owners);

  return (): void => {
    owners.delete(owner);
    if (owners.size === 0) {
      handleOwnersByKernel.delete(kernel);
    }
  };
}

export function mobileSessionOwnsHandle(kernel: Kernel, handleId: string): boolean {
  for (const ownsHandle of handleOwnersByKernel.get(kernel) ?? []) {
    if (ownsHandle(handleId)) {
      return true;
    }
  }
  return false;
}

export function registerMobileSessionHandleClaim(kernel: Kernel, manifestId: string): () => void {
  let settle: () => void = () => undefined;
  const claim: PendingHandleClaim = {
    manifestId,
    settled: new Promise<void>((resolve) => {
      settle = resolve;
    }),
  };
  const claims = pendingClaimsByKernel.get(kernel) ?? new Set<PendingHandleClaim>();
  claims.add(claim);
  pendingClaimsByKernel.set(kernel, claims);

  let pending = true;
  return (): void => {
    if (!pending) {
      return;
    }
    pending = false;
    claims.delete(claim);
    if (claims.size === 0) {
      pendingClaimsByKernel.delete(kernel);
    }
    settle();
  };
}

export async function waitForMobileSessionHandleClaims(
  kernel: Kernel,
  manifestId: string,
): Promise<void> {
  while (true) {
    const matching = Array.from(pendingClaimsByKernel.get(kernel) ?? []).filter(
      (claim) => claim.manifestId === manifestId,
    );
    if (matching.length === 0) {
      return;
    }
    await Promise.all(matching.map((claim) => claim.settled));
  }
}
