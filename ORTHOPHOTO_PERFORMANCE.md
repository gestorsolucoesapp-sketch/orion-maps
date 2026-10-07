# Orthophoto viewer performance — v0.4.4

The map and product thumbnail now share an authenticated, same-origin WebP preview. The original file and its download URL are unchanged. The preview retains the full geographic footprint, transparency and the existing viewer limit of 2400 pixels on the longer side; it is not a replacement technical deliverable.

The route checks the user's existing Postgres RLS permissions before accessing a preview cache. Original Storage reads use that user's token, never a service-role key. Responses are private and are not shared through a public CDN. A bounded in-memory cache and in-flight deduplication avoid repeated conversions. No processing job, survey photo, result record or Storage object is modified.

Contours and other map overlays are loaded when selected, rather than competing with the first orthophoto download. The interface reports actual bytes received, image preparation, display errors, and offers a retry without starting a processing job.

## Verification

A local test used the unchanged source image of the affected survey:

- Source PNG: 52,290,768 bytes (49.87 MiB), 6792 × 5645 pixels.
- Display WebP: 999,004 bytes (0.95 MiB), maximum side 2400 pixels.
- Payload reduction: approximately 98.1%.
- First visible orthophoto: 5.025 seconds in a cold Chromium mobile-sized context, simulated download 1 MiB/s and 100 ms latency, with the server preview already prepared. This is not a production/iPhone loading-time guarantee and excludes a cold server's source download/conversion.
- Initial requests did not include the original PNG, contours or DTM. Toggling the orthophoto did not trigger another download.
- Contours, slope, DTM and DSM still loaded. A simulated preview error was displayed and retry restored the map.
- Original source SHA-256 remained unchanged. Fourteen automated preview/access/terrain tests passed, as did TypeScript, targeted lint and the production build.

Authenticated production rendering must be distinguished from these local tests. Source size, image conversion, layer rendering and recovery were checked locally; deployment readiness and the public version endpoint are checked separately. Technical survey accuracy is outside this UI performance change.
