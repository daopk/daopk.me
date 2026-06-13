# SCSS Architecture

`base.scss` is the only global style entrypoint imported by the shell. It owns
the cascade order and loads the rest of the system through named layers:

- `reset`: browser normalization and root stacking context.
- `tokens`: design tokens and shell-level CSS custom properties.
- `base`: document, body, and platform behavior.
- `vendor`: third-party renderer overrides.
- `utilities`: generic helpers that may be used across apps.

Token files are split by ownership:

- `tokens/_foundation.scss`: palette anchors, spacing, radius, typography, motion.
- `tokens/_chrome.scss`: shell chrome, windows, dock, home screen, widgets.
- `tokens/_theme.scss`: light/dark resolved values.
- `tokens/_density.scss`: touch and shell density overrides.

Keep public CSS custom property names stable unless the consuming components are
updated in the same change. App-specific styles should continue to define their
own scoped variables on the app root and derive from the global tokens.
