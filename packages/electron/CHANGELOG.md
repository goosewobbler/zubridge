# Changelog

## [1.4.0] - 2026-02-19

### Added

- **Action Batching**: Renderer-side action batching that groups multiple actions into single IPC calls to the main process
  - 80-95% reduction in IPC calls for high-frequency updates
  - 20-40% improvement in action latency
  - Configurable batch window (default: 16ms), max batch size (default: 50), and priority flush threshold (default: 80)
  - Automatic flush for high-priority actions (bypassThunkLock)
  - Backpressure handling for actions during active flush
  - Action cancellation support

### Performance

- Reduced IPC call frequency from ~60/sec to ~3-4/sec for 60fps animations
- Improved p50, p95, p99 latency metrics for action dispatch

### Configuration

- New `PreloadOptions.enableBatching` option (default: true)
- New `PreloadOptions.batching` configuration object:
  - `windowMs`: Batch window in milliseconds (default: 16)
  - `maxBatchSize`: Maximum actions per batch (default: 50)
  - `priorityFlushThreshold`: Priority threshold for immediate flush (default: 80)

### IPC Channels

- Added `BATCH_DISPATCH` channel for sending batched actions
- Added `BATCH_ACK` channel for batch acknowledgments

### Testing

- Added comprehensive unit tests for ActionBatcher
- Added integration tests for batching with thunks and mixed priorities

# [1.0.0](https://github.com/goosewobbler/zubridge/compare/v0.0.1-next.2...v1.0.0) (2025-03-12)

## [0.0.1-next.2](https://github.com/goosewobbler/zubridge/compare/v0.0.1-next.1...v0.0.1-next.2) (2025-03-12)

## 0.0.1-next.1 (2025-03-12)
