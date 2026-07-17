<script setup vapor lang="ts">
import { AppToolbar, ToolbarGroup, ToolbarTitle } from "@daopk/kit";
import { Button, IconButton } from "@daopk/ui";
import { ChevronLeft, ChevronRight } from "@daopk/icons";

defineProps<{
  readonly navigationUnitLabel: string;
  readonly visibleRangeLabel: string;
}>();

const emit = defineEmits<{
  next: [];
  previous: [];
  today: [];
}>();
</script>

<template>
  <AppToolbar class="calendar__toolbar">
    <template #start>
      <div class="calendar__title-group">
        <ToolbarTitle class="calendar__title-stack" :title="visibleRangeLabel" />
      </div>
    </template>

    <div class="calendar__controls">
      <ToolbarGroup class="calendar__nav" label="Calendar navigation">
        <IconButton
          class="calendar__icon-button"
          :ariaLabel="`Previous ${navigationUnitLabel}`"
          @click="emit('previous')"
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <Button class="calendar__nav-button" size="sm" @click="emit('today')">Today</Button>
        <IconButton
          class="calendar__icon-button"
          :ariaLabel="`Next ${navigationUnitLabel}`"
          @click="emit('next')"
        >
          <ChevronRight aria-hidden="true" />
        </IconButton>
      </ToolbarGroup>
    </div>
  </AppToolbar>
</template>
