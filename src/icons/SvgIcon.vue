<script setup lang="ts" vapor>
import { computed } from "vue";
import { iconToSVG, replaceIDs, type IconifyIcon } from "@iconify/utils";

type IconSize = number | string;

const props = withDefaults(
  defineProps<{
    icon: IconifyIcon;
    size?: IconSize;
    strokeWidth?: IconSize;
  }>(),
  {
    size: 24,
    strokeWidth: undefined,
  },
);

function escapeAttributeValue(value: IconSize): string {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function withStrokeWidth(body: string, strokeWidth: IconSize): string {
  return body.replace(
    /stroke-width="[^"]+"/g,
    `stroke-width="${escapeAttributeValue(strokeWidth)}"`,
  );
}

const rendered = computed(() => {
  const result = iconToSVG(props.icon, {
    width: props.size,
    height: props.size,
  });
  const body =
    props.strokeWidth === undefined ? result.body : withStrokeWidth(result.body, props.strokeWidth);

  return {
    attributes: result.attributes,
    body: replaceIDs(body),
  };
});
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    aria-hidden="true"
    role="img"
    v-bind="rendered.attributes"
    v-html="rendered.body"
  />
</template>
