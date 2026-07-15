<script setup vapor lang="ts">
import { onBeforeUnmount } from "vue";
import { useToast as useRopavToast } from "ropav/toast";

import { connectToastProvider } from "./useToast";

const disconnect = connectToastProvider(useRopavToast());

onBeforeUnmount(disconnect);
</script>

<template></template>
