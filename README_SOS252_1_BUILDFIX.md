# SOS252.1 build fix
- Vercel TypeScript error: `s.data is possibly null` in admin/sos-progress async map fixed.
- After the existing null guard, `s.data` is captured as `sessionData` before entering async callbacks.
- SOS252 automatic second-diagnosis flow is unchanged.
- No SQL required.
