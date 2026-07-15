import type { InjectionKey } from "vue";

export interface RadioGroupAdapterContext {
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly modelValue: string | undefined;
  readonly name: string;
  readonly required: boolean;
  select(value: string): void;
}

export const radioGroupAdapterKey: InjectionKey<RadioGroupAdapterContext> =
  Symbol("radio-group-adapter");
