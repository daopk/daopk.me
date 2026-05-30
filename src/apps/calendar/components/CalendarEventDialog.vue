<script setup lang="ts">
import { computed } from "vue";

import { FormField, Select, StatusBanner, Textarea, TextInput } from "~/components/kit";
import { Button, Dialog } from "~/components/ui";
import { Trash2 } from "~/icons/lucide";

import { colorLabel, type EventFormState } from "../eventForm";
import type { CalendarEventColor } from "../useCalendar";

const props = defineProps<{
  readonly eventColors: readonly CalendarEventColor[];
  readonly form: EventFormState;
  readonly formError: string | null;
  readonly open: boolean;
  readonly title: string;
  readonly variant?: "modal" | "sheet";
}>();

const colorOptions = computed(() =>
  props.eventColors.map((color) => ({ value: color, label: colorLabel(color) })),
);

const emit = defineEmits<{
  "update:open": [open: boolean];
  allDayChange: [checked: boolean];
  cancelDelete: [];
  close: [];
  confirmDelete: [];
  requestDelete: [];
  submit: [];
}>();

function onAllDayChange(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    emit("allDayChange", target.checked);
  }
}
</script>

<template>
  <Dialog
    :open="open"
    :title="title"
    :variant="variant"
    description="Event details are saved to your local calendar."
    @update:open="emit('update:open', $event)"
    @close="emit('close')"
  >
    <form class="calendar__form" @submit.prevent="emit('submit')">
      <FormField class="calendar__field" label="Title">
        <TextInput v-model="form.title" class="calendar__input" type="text" autocomplete="off" />
      </FormField>

      <div class="calendar__form-row">
        <FormField class="calendar__field" label="Date">
          <TextInput v-model="form.date" class="calendar__input" type="date" />
        </FormField>
        <label class="calendar__check-field">
          <input type="checkbox" :checked="form.allDay" @change="onAllDayChange" />
          <span>All day</span>
        </label>
      </div>

      <div class="calendar__form-row">
        <FormField class="calendar__field" label="Start">
          <TextInput
            v-model="form.startTime"
            class="calendar__input"
            type="time"
            :disabled="form.allDay"
          />
        </FormField>
        <FormField class="calendar__field" label="End">
          <TextInput
            v-model="form.endTime"
            class="calendar__input"
            type="time"
            :disabled="form.allDay"
          />
        </FormField>
      </div>

      <FormField class="calendar__field" label="Color">
        <Select v-model="form.color" class="calendar__input" :options="colorOptions" />
      </FormField>

      <FormField class="calendar__field" label="Notes">
        <Textarea v-model="form.notes" class="calendar__textarea" :rows="3" />
      </FormField>

      <StatusBanner v-if="formError" as="p" class="calendar__form-error" tone="error" role="alert">
        {{ formError }}
      </StatusBanner>

      <StatusBanner
        v-if="form.confirmingDelete"
        class="calendar__delete-confirm"
        tone="error"
        role="alert"
      >
        <span>Delete this event?</span>
        <Button size="sm" @click="emit('cancelDelete')">Cancel</Button>
        <Button size="sm" variant="danger" @click="emit('confirmDelete')">Delete</Button>
      </StatusBanner>

      <footer class="calendar__form-actions">
        <Button
          v-if="form.id !== null && !form.confirmingDelete"
          size="sm"
          variant="danger"
          :icon-start="Trash2"
          @click="emit('requestDelete')"
        >
          Delete
        </Button>
        <span class="calendar__form-spacer" />
        <Button size="sm" @click="emit('close')">Cancel</Button>
        <Button size="sm" variant="primary" type="submit">Save</Button>
      </footer>
    </form>
  </Dialog>
</template>

<style scoped lang="scss">
.calendar__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.calendar__form-row {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.calendar__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-inline-size: 0;

  span {
    color: var(--color-fg-muted);
    font-size: 12px;
  }
}

.calendar__check-field {
  align-items: center;
  align-self: end;
  color: var(--color-fg);
  display: flex;
  gap: var(--space-sm);
  min-block-size: 32px;
}

.calendar__input,
.calendar__textarea {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-fg);
  font: inherit;
  inline-size: 100%;
  min-block-size: 32px;
  min-inline-size: 0;
  padding: var(--space-xs) var(--space-sm);

  &:focus-visible {
    border-color: var(--color-accent);
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  &:disabled {
    color: var(--color-fg-muted);
    opacity: 0.7;
  }
}

.calendar__textarea {
  min-block-size: 76px;
  resize: vertical;
}

.calendar__form-error {
  color: var(--color-error);
  margin: 0;
}

.calendar__delete-confirm {
  align-items: center;
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-error) 42%, transparent);
  border-radius: var(--radius-sm);
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
  padding: var(--space-sm);

  span {
    margin-inline-end: auto;
  }
}

.calendar__form-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.calendar__form-spacer {
  flex: 1 1 auto;
}

@media (max-width: 520px) {
  .calendar__form {
    gap: var(--space-sm);
  }

  .calendar__form-row {
    grid-template-columns: 1fr;
  }

  .calendar__input,
  .calendar__textarea {
    font-size: 16px;
  }

  .calendar__delete-confirm {
    align-items: stretch;
    flex-wrap: wrap;
  }

  .calendar__delete-confirm span {
    flex: 1 0 100%;
    margin-inline-end: 0;
  }

  .calendar__form-actions {
    justify-content: flex-end;
  }

  .calendar__form-spacer {
    flex-basis: 100%;
  }
}
</style>
