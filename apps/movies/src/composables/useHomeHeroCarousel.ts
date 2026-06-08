import { computed, nextTick, ref, watch, type Ref } from "vue";
import type { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import useEmblaCarousel from "embla-carousel-vue";

const HERO_DRAG_CLICK_DISTANCE = 8;
const HERO_EMBLA_OPTIONS: EmblaOptionsType = {
  align: "center",
  containScroll: false,
  dragThreshold: HERO_DRAG_CLICK_DISTANCE,
  duration: 24,
  loop: true,
  skipSnaps: false,
};

export interface UseHomeHeroCarouselBindings {
  readonly activeIndex: Ref<number>;
  readonly isDesktopDragging: Ref<boolean>;
  readonly setDesktopHeroRef: (element: unknown) => void;
  readonly setMobileHeroRef: (element: unknown) => void;
  resetHero(): Promise<void>;
  setActiveIndex(index: number): void;
}

export function normalizeHomeHeroIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  return ((index % length) + length) % length;
}

export function useHomeHeroCarousel(
  items: Readonly<Ref<readonly unknown[]>>,
): UseHomeHeroCarouselBindings {
  const activeIndex = ref(0);
  const isDesktopDragging = ref(false);
  const itemCount = computed(() => items.value.length);
  const [desktopHeroEmblaRef, desktopHeroEmblaApi] = useEmblaCarousel(HERO_EMBLA_OPTIONS);
  const [mobileHeroEmblaRef, mobileHeroEmblaApi] = useEmblaCarousel(HERO_EMBLA_OPTIONS);

  watch(
    desktopHeroEmblaApi,
    (api, _previousApi, onCleanup) => {
      if (api === undefined) {
        return;
      }

      api.on("select", syncDesktopHeroFromEmbla);
      api.on("reInit", syncDesktopHeroFromEmbla);
      api.on("pointerDown", onDesktopHeroPointerDown);
      api.on("pointerUp", onDesktopHeroPointerUp);
      syncHeroFromEmbla(api, "desktop");

      onCleanup(() => {
        api.off("select", syncDesktopHeroFromEmbla);
        api.off("reInit", syncDesktopHeroFromEmbla);
        api.off("pointerDown", onDesktopHeroPointerDown);
        api.off("pointerUp", onDesktopHeroPointerUp);
      });
    },
    { immediate: true },
  );

  watch(
    mobileHeroEmblaApi,
    (api, _previousApi, onCleanup) => {
      if (api === undefined) {
        return;
      }

      api.on("select", syncMobileHeroFromEmbla);
      api.on("reInit", syncMobileHeroFromEmbla);
      syncHeroFromEmbla(api, "mobile");

      onCleanup(() => {
        api.off("select", syncMobileHeroFromEmbla);
        api.off("reInit", syncMobileHeroFromEmbla);
      });
    },
    { immediate: true },
  );

  watch(itemCount, () => {
    activeIndex.value = 0;
    void resetHero();
  });

  function setDesktopHeroRef(element: unknown): void {
    desktopHeroEmblaRef.value = element instanceof HTMLElement ? element : undefined;
  }

  function setMobileHeroRef(element: unknown): void {
    mobileHeroEmblaRef.value = element instanceof HTMLElement ? element : undefined;
  }

  function setActiveIndex(index: number): void {
    if (itemCount.value === 0) {
      return;
    }

    const nextIndex = normalizeHomeHeroIndex(index, itemCount.value);
    activeIndex.value = nextIndex;
    scrollHeroEmblaToIndex(nextIndex);
  }

  async function resetHero(): Promise<void> {
    await nextTick();
    desktopHeroEmblaApi.value?.reInit();
    mobileHeroEmblaApi.value?.reInit();
    scrollHeroEmblaToIndex(0, true);
  }

  function scrollHeroEmblaToIndex(index: number, jump = false): void {
    if (desktopHeroEmblaApi.value?.selectedScrollSnap() !== index) {
      desktopHeroEmblaApi.value?.scrollTo(index, jump);
    }

    if (mobileHeroEmblaApi.value?.selectedScrollSnap() !== index) {
      mobileHeroEmblaApi.value?.scrollTo(index, jump);
    }
  }

  function syncDesktopHeroFromEmbla(api: EmblaCarouselType): void {
    syncHeroFromEmbla(api, "desktop");
  }

  function syncMobileHeroFromEmbla(api: EmblaCarouselType): void {
    syncHeroFromEmbla(api, "mobile");
  }

  function syncHeroFromEmbla(api: EmblaCarouselType, source: "desktop" | "mobile"): void {
    if (itemCount.value === 0) {
      activeIndex.value = 0;
      return;
    }

    const nextIndex = normalizeHomeHeroIndex(api.selectedScrollSnap(), itemCount.value);
    if (nextIndex !== activeIndex.value) {
      activeIndex.value = nextIndex;
    }

    const pairedApi = source === "desktop" ? mobileHeroEmblaApi.value : desktopHeroEmblaApi.value;
    if (pairedApi !== undefined && pairedApi.selectedScrollSnap() !== nextIndex) {
      pairedApi.scrollTo(nextIndex);
    }
  }

  function onDesktopHeroPointerDown(): void {
    isDesktopDragging.value = true;
  }

  function onDesktopHeroPointerUp(): void {
    isDesktopDragging.value = false;
  }

  return {
    activeIndex,
    isDesktopDragging,
    setDesktopHeroRef,
    setMobileHeroRef,
    resetHero,
    setActiveIndex,
  };
}
