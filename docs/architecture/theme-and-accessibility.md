# Theme and Accessibility

The frontend now treats light and dark themes as first-class states rather than a forced dark wrapper.

## Theme Behavior

- Preferences: `system`, `light`, `dark`
- Persistence: `localStorage` key `adaptive-surface.theme`
- Resolution: system media query when preference is `system`
- First paint: inline script in `index.html`
- Runtime control: theme segmented control in the floating shell controls

## Accessibility Requirements

- Visible focus uses semantic focus-ring tokens.
- Keyboard controls are native buttons and inputs.
- Reduced motion removes large travel and repeated animation.
- Semantic zones are rendered with landmarks where practical.
- Contrast must be checked independently in light and dark themes during visual QA.

## Remaining Work

Automated contrast and screen-reader announcement tests are not yet configured in this repository. Current coverage is focused on typed theme logic, keyboard-native controls, and reduced-motion planning.
