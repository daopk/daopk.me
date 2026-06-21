import type { ComputedRef, InjectionKey } from "vue";

/**
 * Context a {@link FormField} publishes to the labelled control nested in its
 * default slot. Kit form controls (`TextInput`, `Textarea`, `Select`,
 * `Checkbox`) inject it to auto-wire `id` / `aria-describedby` / `aria-invalid`
 * / `aria-required` without the app having to thread ids by hand.
 */
export interface FormFieldContext {
  /** Stable id to set on the control and mirror onto the label's `for`. */
  readonly controlId: ComputedRef<string | undefined>;
  /** Id of the hint/error message node for `aria-describedby`, or undefined. */
  readonly describedById: ComputedRef<string | undefined>;
  /** Whether the field currently has an error. */
  readonly invalid: ComputedRef<boolean>;
  /** Whether the field is required. */
  readonly required: ComputedRef<boolean>;
}

export const FormFieldContextKey: InjectionKey<FormFieldContext> = Symbol("daopk.kit.formField");
