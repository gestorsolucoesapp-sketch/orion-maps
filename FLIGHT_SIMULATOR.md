# Flight simulator — Orion Maps 0.4.16

`/waypoints` has two workspace tabs: Planejamento and Simular voo. A valid generated route is required. The planning workspace remains mounted, with its geometry and form state unchanged. The simulator is lazy-loaded and disposed when returning to planning.

## Read-only boundary

The simulator does not save a plan, upload images, create a survey, generate a KMZ, call a server action, start an agent, connect to the RC 2, or send commands to a drone. Only public background map tiles and application assets are requested. No database schema, authentication, processing, original ortho viewer, existing route generator, metrics, export or transfer implementation is changed.

The timeline uses copied coordinates from the exact ordered route (`legs.flat()`), including the existing connections between strips. Supported generator modes are manual waypoints, grid, double grid, oblique grid, corridor and orbit. Straight segments are preserved; corners are not silently rounded into a different trajectory.

## Simulation assumptions

The default simulated home is the first waypoint, explicitly labelled as an assumption rather than GPS or a confirmed takeoff location. A separate home can be chosen on the simulation map, or explicitly copied from a position already informed in the planning workspace. It affects the simulated approach and direct return only; it is not written to the plan or export.

Altitude is relative to the simulated home and assumes flat ground. Default ascent and descent rates are 2 m/s, with 1 s at each non-collinear heading change. These are editable simulation assumptions, not DJI performance specifications. Total simulated duration includes those phases; the original planner's distance/speed metric is displayed separately for comparison. No wind, acceleration, real turn arcs, collision check, terrain following, geofence, RC link, camera latency, battery consumption or battery exchange is simulated.

The first virtual photo is at the first waypoint. Time mode uses the selected interval across route travel, inter-strip connections and turn pauses. Distance mode uses cumulative horizontal route distance, including connections. Manual mode previews the chosen interval but does not enable capture in the real drone. Capture stops at the last waypoint; ascent, approach, return and landing do not take photos. More than 30,000 virtual photos is rejected; the map displays at most 2,000 sampled markers while the counter and seek operations use the entire event list.

## Implementation

- `src/lib/flight-simulation.ts`: deterministic segment timeline, Haversine distances, great-circle interpolation, heading changes, virtual captures, binary-search seeking and monotonic playback clock.
- `flight-simulator.tsx`: start/pause/resume/restart, 1–32× playback, timeline, next photo, relative altitude, horizontal speed/distance, photo count and separate home assumptions.
- `simulation-map.tsx`: independent MapLibre instance, route, trace, photos, home marker, follow/fit, map/satellite backgrounds and 2D/3D camera.
- `simulation-drone.ts`: procedural 3D mesh rendered in MapLibre's WebGL2 custom layer, with animated rotors. Intentionally enlarged for legibility; not a scale model of a specific DJI aircraft. GL resources are disposed with the map.

The animation uses requestAnimationFrame timestamps, pauses on document visibility loss and releases its frame loop on unmount. The expanded view supports Escape and restores body scrolling when closed. Playback never starts automatically.

## Regression checks

`node --test tests/flight-simulation.test.mjs`

Checks cover immutable route snapshots, connection lengths matching existing metrics, takeoff/landing, custom home, optional return, heading pauses, time and distance photo events, exact endpoint triggers, manual preview, rewind, interpolation, input/resource validation, duplicate joins, clock rates, and all existing generators. The UI test uses synthetic unsaved plans and blocks every POST/PUT/PATCH/DELETE request, checking that original JSON, local storage and RC-transfer state remain unchanged.

External rendering contract: MapLibre GL JS installed `CustomLayerInterface`, `CustomRenderMethodInput.defaultProjectionData.mainMatrix` and `MercatorCoordinate.fromLngLat`. Animation timing reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame

## Local release verification

Production build and focused ESLint completed successfully. All 79 top-level JavaScript regression tests passed (including 23 dedicated simulation tests). Browser QA completed 33 checks at widths 1440, 390 and 360 px with zero browser errors, zero server/device write attempts, and unchanged editable plan JSON and local storage. These are browser viewport tests, not a flight certification or a test on a physical iPhone.
