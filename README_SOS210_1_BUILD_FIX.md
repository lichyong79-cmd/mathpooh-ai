# SOS210.1 Build Fix

- Fixed TypeScript strict-mode build error in `src/components/sos-diagnosis-runner.tsx`.
- `items`, `initialRaw`, `initialIndex`, and `index` now have explicit numeric/array types.
- `setIndex` updater callback parameter is explicitly typed as `number`.
- No behavior change to the diagnosis flow.
