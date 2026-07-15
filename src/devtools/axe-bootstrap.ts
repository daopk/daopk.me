import { debugLog, debugWarn } from "~/core/debug";

const AUDIT_DELAY_MS = 250;
const noop = (): void => {};

/**
 * Run axe directly instead of installing a Vue plugin. DOM mutation batching
 * keeps the development audit useful without coupling it to either renderer.
 */
export async function installAxeIfDev(): Promise<() => void> {
  if (!import.meta.env.DEV || typeof document === "undefined") {
    return noop;
  }

  try {
    const { default: axe } = await import("axe-core");
    let auditTimer: ReturnType<typeof setTimeout> | undefined;
    let auditRunning = false;
    let auditRequested = false;
    let disposed = false;
    let lastViolationSignature = "";

    const observer = new MutationObserver(scheduleAudit);
    const observerOptions = {
      attributeFilter: [
        "aria-expanded",
        "aria-hidden",
        "aria-selected",
        "disabled",
        "hidden",
        "role",
      ],
      attributes: true,
      childList: true,
      subtree: true,
    } satisfies MutationObserverInit;

    function observeDocument(): void {
      observer.observe(document.documentElement, observerOptions);
    }

    function scheduleAudit(): void {
      if (disposed) {
        return;
      }

      if (auditRunning) {
        auditRequested = true;
        return;
      }

      if (auditTimer !== undefined) {
        clearTimeout(auditTimer);
      }

      auditTimer = setTimeout(() => {
        auditTimer = undefined;
        void runAudit();
      }, AUDIT_DELAY_MS);
    }

    async function runAudit(): Promise<void> {
      if (disposed) {
        return;
      }

      auditRunning = true;
      observer.disconnect();
      try {
        const results = await axe.run(document, {
          resultTypes: ["violations"],
          rules: {
            // Intentional native-shell behavior: browser zoom is disabled at
            // the product level, so this known viewport exception is not
            // actionable in development audits.
            "meta-viewport": { enabled: false },
          },
        });

        const violationSignature = JSON.stringify(
          results.violations.map((violation) => ({
            id: violation.id,
            targets: violation.nodes.map((node) => node.target),
          })),
        );

        if (
          !disposed &&
          results.violations.length > 0 &&
          violationSignature !== lastViolationSignature
        ) {
          debugWarn(
            `[axe] ${results.violations.length} accessibility violation${results.violations.length === 1 ? "" : "s"}`,
            results.violations,
          );
        }

        lastViolationSignature = violationSignature;
      } catch (error) {
        if (!disposed) {
          debugWarn("[axe] accessibility audit failed", error);
        }
      } finally {
        auditRunning = false;

        if (!disposed) {
          observeDocument();
        }

        if (auditRequested && !disposed) {
          auditRequested = false;
          scheduleAudit();
        }
      }
    }

    observeDocument();

    scheduleAudit();
    debugLog("[axe] direct DOM audits enabled in dev mode");

    return () => {
      disposed = true;
      observer.disconnect();
      if (auditTimer !== undefined) {
        clearTimeout(auditTimer);
      }
    };
  } catch (error) {
    debugLog("[axe] failed to start — continuing without a11y dev audits", error);
    return noop;
  }
}
