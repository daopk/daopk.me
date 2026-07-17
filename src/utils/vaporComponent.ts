import type { Component, VaporComponent } from "vue";

export type VerifiedVaporComponent = Component & VaporComponent & { readonly __vapor: true };

export function isVaporComponent(component: unknown): component is VerifiedVaporComponent {
  return (
    (typeof component === "object" || typeof component === "function") &&
    component !== null &&
    "__vapor" in component &&
    component.__vapor === true
  );
}

export function assertVaporComponent(
  component: unknown,
  name = "Component",
): asserts component is VerifiedVaporComponent {
  if (!isVaporComponent(component)) {
    throw new TypeError(`${name} was not compiled in Vapor mode`);
  }
}

/**
 * Adapt the neutral component-loader contract to Vue's Vapor-only async API.
 * The runtime assertion prevents a VDOM component from crossing this boundary.
 */
export function verifiedVaporLoader(
  loader: () => Promise<{ default: Component }>,
  name = "Async component",
): () => Promise<{ default: VerifiedVaporComponent }> {
  return async () => {
    const module = await loader();
    assertVaporComponent(module.default, name);
    return module as { default: VerifiedVaporComponent };
  };
}
