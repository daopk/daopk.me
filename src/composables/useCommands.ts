import { onScopeDispose, ref, type Ref } from "vue";

import { useKernel } from "~/composables/useKernel";

import type { CommandDispatchOptions, CommandManifest } from "~/types/command";

export interface UseCommandsBindings {
  commands: Ref<readonly CommandManifest[]>;
  register: (manifest: CommandManifest) => () => void;
  unregister: (id: string) => void;
  dispatch: (id: string, options?: CommandDispatchOptions) => Promise<void>;
}

export function useCommands(): UseCommandsBindings {
  const kernel = useKernel();

  const commands = ref<readonly CommandManifest[]>(kernel.commands.list());

  const refresh = (): void => {
    commands.value = kernel.commands.list();
  };

  const stopRegistered = kernel.events.on("command.registered", refresh);
  const stopUnregistered = kernel.events.on("command.unregistered", refresh);

  onScopeDispose(() => {
    stopRegistered();
    stopUnregistered();
  });

  return {
    commands,
    register: (manifest) => kernel.commands.register(manifest),
    unregister: (id) => {
      kernel.commands.unregister(id);
    },
    dispatch: (id, options) => kernel.commands.dispatch(id, options),
  };
}
