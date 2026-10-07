# Map measurements — Orion Maps 0.4.1

Shared ruler in the flight planner, Agro map and processed-results map. The tool supports open paths, polygons, live horizontal area and perimeter, draggable vertices, midpoint insertion, vertex removal, undo/redo, hide/reopen, m/km and m²/ha/km², and GeoJSON export.

Calculations use GeographicLib 2.2.0 on the WGS84 ellipsoid. Measurements do not follow terrain, calculate 3D surface area, certify positional accuracy or change a flight mission. Decimal places are display formatting, not measured accuracy. Maximum 200 vertices; supported latitude ±80°; each point must be within 100 km of the first; antimeridian crossings are rejected. Self-crossed and degenerate polygon outlines do not produce a valid area.

The ruler maintains an isolated interaction mode so ruler clicks do not add flight waypoints or change crop selections. Original map layers and processing agents are not changed.

Authenticated saves use `map_measurements` with owner-only row-level access. A survey-linked measurement requires access to that survey. Saves are append-only, idempotent for the same request ID, and read back before success is shown. Input geometry and computed metrics are validated again by the server. Project-associated measurements can be reopened in another authenticated browser. Anonymous saves fail without erasing the draft. Up to 100 recent measurements are listed.

## Validation

- `node tests/test-map-measurement.cjs`: 22 geometry, bounds, units and export tests.
- `node tests/test-agro-plan.cjs`: existing 19 geometry regressions.
- `node tests/test-processing-activity.cjs`: existing 11 activity assertions.
- Python processing tests are unchanged and run separately.
- Browser verification covers path/polygon clicks, original waypoint isolation, dragging, midpoint insertion, undo/redo, unit changes, export, rejected anonymous save, authenticated save and retry, mobile reload of a saved project measurement and basemap switching.
- Layout checks at widths 360, 390 and 1440 px.

The processed-results map is wired to the same shared component. Existing orthophoto preparation, raster products and processing execution remain unmodified. No fabricated survey results are used as evidence of photogrammetry completion.
