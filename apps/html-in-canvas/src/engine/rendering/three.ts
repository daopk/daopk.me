export type ThreeModule = typeof import("three/webgpu");
export type ThreeLoader = () => Promise<ThreeModule>;

export async function loadThree(): Promise<ThreeModule> {
  return await import("three/webgpu");
}
