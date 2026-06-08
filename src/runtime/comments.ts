/**
 * Stable re-export façade for reusable public comment surfaces. First-party
 * apps import `@daopk/comments` and reuse this host chunk instead of bundling
 * separate copies of the Giscus wrapper and target-key helpers.
 */
export { default as GiscusComments } from "~/components/comments/GiscusComments.vue";
export * from "~/core/comments";
