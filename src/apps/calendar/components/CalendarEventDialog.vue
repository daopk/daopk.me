<script setup lang="ts">
import { Button, Dialog } from "~/components/ui";
import { Trash2 } from "~/icons/lucide";

import { colorLabel, type EventFormState } from "../eventForm";
import type { CalendarEventColor } from "../useCalendar";

defineProps<{
  readonly eventColors: readonly CalendarEventColor[];
  readonly form: EventFormState;
  readonly formError: string | null;
  readonly open: boolean;
  readonly title: string;
  readonly variant?: "modal" | "sheet";
}>();

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
      <label class="calendar__field">
        <span>Title</span>
        <input v-model="form.title" class="calendar__input" type="text" autocomplete="off" />
      </label>

      <div class="calendar__form-row">
        <label class="calendar__field">
          <span>Date</span>
          <input v-model="form.date" class="calendar__input" type="date" />
        </label>
        <label class="calendar__check-field">
          <input type="checkbox" :checked="form.allDay" @change="onAllDayChange" />
          <span>All day</span>
        </label>
      </div>

      <div class="calendar__form-row">
        <label class="calendar__field">
          <span>Start</span>
          <input
            v-model="form.startTime"
            class="calendar__input"
            type="time"
            :disabled="form.allDay"
          />
        </label>
        <label class="calendar__field">
          <span>End</span>
          <input
            v-model="form.endTime"
            class="calendar__input"
            type="time"
            :disabled="form.allDay"
          />
        </label>
      </div>

      <label class="calendar__field">
        <span>Color</span>
        <select v-model="form.color" class="calendar__input">
          <option v-for="color in eventColors" :key="color" :value="color">
            {{ colorLabel(color) }}
          </option>
        </select>
      </label>

      <label class="calendar__field">
        <span>Notes</span>
        <textarea v-model="form.notes" class="calendar__textarea" rows="3" />
      </label>

      <p v-if="formError" class="calendar__form-error" role="alert">{{ formError }}</p>

      <div v-if="form.confirmingDelete" class="calendar__delete-confirm" role="alert">
        <span>Delete this event?</span>
        <Button size="sm" @click="emit('cancelDelete')">Cancel</Button>
        <Button size="sm" variant="primary" @click="emit('confirmDelete')">Delete</Button>
      </div>

      <footer class="calendar__form-actions">
        <Button
          v-if="form.id !== null && !form.confirmingDelete"
          size="sm"
          variant="ghost"
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
