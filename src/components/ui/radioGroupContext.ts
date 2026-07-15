import type { InjectionKey } from "vue";

export interface RadioGroupAdapterContext {
  readonly disabled: boolean;
  readonly modelValue: string | undefined;
  readonly name: string;
  select(value: string): void;
}

export const radioGroupAdapterKey: InjectionKey<RadioGroupAdapterContext> =
  Symbol("radio-group-adapter");
