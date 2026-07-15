interface DialogStackEntry {
  readonly id: symbol;
  readonly modal: boolean;
  readonly root: HTMLElement;
}

interface InertSnapshot {
  readonly ariaHidden: string | null;
  readonly inert: boolean;
}

const stack: DialogStackEntry[] = [];
const inertSnapshots = new Map<HTMLElement, InertSnapshot>();

let originalBodyOverflow: string | null = null;

function restoreInertBackground(): void {
  for (const [element, snapshot] of inertSnapshots) {
    element.inert = snapshot.inert;
    if (snapshot.ariaHidden === null) {
      element.removeAttribute("aria-hidden");
    } else {
      element.setAttribute("aria-hidden", snapshot.ariaHidden);
    }
  }
  inertSnapshots.clear();
}

function inertElement(element: HTMLElement): void {
  if (!inertSnapshots.has(element)) {
    inertSnapshots.set(element, {
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.inert,
    });
  }
  element.inert = true;
  element.setAttribute("aria-hidden", "true");
}

function inertUnprotectedBranches(
  parent: HTMLElement,
  protectedRoots: readonly HTMLElement[],
): void {
  for (const child of parent.children) {
    if (!(child instanceof HTMLElement)) continue;

    const protectsDialog = protectedRoots.some((root) => child === root || child.contains(root));
    if (!protectsDialog) {
      inertElement(child);
      continue;
    }

    if (!protectedRoots.includes(child)) {
      inertUnprotectedBranches(child, protectedRoots);
    }
  }
}

function syncModalEffects(): void {
  restoreInertBackground();

  const modalEntries = stack.filter((entry) => entry.modal && entry.root.isConnected);
  if (modalEntries.length === 0) {
    if (originalBodyOverflow !== null) {
      document.body.style.overflow = originalBodyOverflow;
      originalBodyOverflow = null;
    }
    return;
  }

  if (originalBodyOverflow === null) {
    originalBodyOverflow = document.body.style.overflow;
  }
  document.body.style.overflow = "hidden";

  const protectedRoots = stack
    .map((entry) => entry.root)
    .filter((root) => root.isConnected && document.body.contains(root));
  inertUnprotectedBranches(document.body, protectedRoots);
}

export function registerDialog(entry: DialogStackEntry): void {
  const existingIndex = stack.findIndex((candidate) => candidate.id === entry.id);
  if (existingIndex !== -1) stack.splice(existingIndex, 1);
  stack.push(entry);
  syncModalEffects();
}

export function unregisterDialog(id: symbol): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index !== -1) stack.splice(index, 1);
  syncModalEffects();
}

export function isTopDialog(id: symbol): boolean {
  return stack.at(-1)?.id === id;
}
