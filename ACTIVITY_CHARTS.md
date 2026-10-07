# Activity charts — Orion Maps 0.4.2

This release changes only the web display. It does not modify the processing agent, the companion monitor, NodeODM, Docker settings, the processing queue, or survey files. No processing restart is required.

The activity panel now shows a CPU history and a depth-map inventory history using the existing `processing_jobs.activity.history` samples. The view is anchored to the last received sample and covers up to five minutes. It also shows the sample mean and peak CPU usage, receipt timestamp, and number of observed readings. The memory meter uses the existing memory-used / limit measurement. The last three observed engine events are visible without expanding a disclosure.

The graphs never advance just because the browser clock ticks. A brief receipt indicator animates once on a new sample; there is no endlessly animated progress simulation. Stale or mismatched samples are not represented as current activity. Missing samples break the lines. File inventory uses steps instead of smoothing and does not infer photos completed. File deltas are omitted across missing readings, long gaps or count resets. CPU axes start at zero and support values above 100 percent; resource usage is not a completion percentage.

## Validation

- 28 unit checks in `tests/test-activity-charts.cjs`: task identity, timestamp ordering, deduplication, stale-window bounds, missing values, multicore CPU range, gaps, file-count resets, and memory units.
- Existing 11 activity assertions pass without modifying the monitor.
- Production build and lint checks pass.
- Isolated component rendering was checked at widths 360, 390 and 1440 pixels, using a captured real telemetry sample. Nine rendering checks cover charts, event visibility, memory, stale labels and absence of timer-driven graph movement.
- The isolated browser check uses no account credentials, network calls or processing actions. It is not an authenticated production end-to-end test.

The worker PID, container identity/start time and running job identity are checked separately before and after the release. The deployment changes the web app only.
