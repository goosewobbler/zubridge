//! Window-based action batching.
//!
//! Ports `packages/electron/src/batching/ActionBatcher.ts` and
//! `packages/electron/src/batching/types.ts`.
//!
//! The Rust batcher is timer-neutral: it does not schedule its own timer.
//! The embedding runtime calls [`ActionBatcher::maybe_flush`] at regular
//! intervals (e.g. every 16 ms) and [`ActionBatcher::take_batch`] when
//! a flush is needed. The `BATCH_DISPATCH` / `BATCH_ACK` payload shapes
//! are preserved for IPC compatibility with the TypeScript renderer.

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::models::ZubridgeAction;
use crate::action::{PRIORITY_IMMEDIATE, PRIORITY_NORMAL, PRIORITY_THUNK};

// ── Configuration ─────────────────────────────────────────────────────────────

/// Batching configuration. Mirrors `BatchingConfig` in `batching/types.ts`.
#[derive(Debug, Clone)]
pub struct BatchingConfig {
    /// Time window between flushes (default 16 ms ≈ one frame at 60 fps).
    pub window_ms: u64,
    /// Maximum number of actions per batch (default 50).
    pub max_batch_size: usize,
    /// Actions with priority ≥ this threshold trigger an immediate flush (default 80).
    pub priority_flush_threshold: i32,
}

impl Default for BatchingConfig {
    fn default() -> Self {
        Self {
            window_ms: 16,
            max_batch_size: 50,
            priority_flush_threshold: 80,
        }
    }
}

// ── IPC payload shapes ────────────────────────────────────────────────────────
//
// These must remain wire-compatible with the TypeScript renderer's
// `BatchPayload` and `BatchAckPayload`.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchActionEntry {
    pub action: ZubridgeAction,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

/// Outbound batch payload (`BATCH_DISPATCH`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchPayload {
    pub batch_id: String,
    pub actions: Vec<BatchActionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchActionResult {
    pub action_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Inbound acknowledgement payload (`BATCH_ACK`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchAckPayload {
    pub batch_id: String,
    pub results: Vec<BatchActionResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ── Internal queue item ───────────────────────────────────────────────────────

#[derive(Debug)]
pub struct QueuedBatchItem {
    pub action: ZubridgeAction,
    pub id: String,
    pub parent_id: Option<String>,
    pub priority: i32,
}

// ── Stats ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct BatchStats {
    pub total_batches: u64,
    pub total_actions: u64,
    pub rejected_actions: u64,
    pub current_queue_size: usize,
    pub is_flushing: bool,
    pub queue_limit: usize,
}

impl BatchStats {
    pub fn average_batch_size(&self) -> f64 {
        if self.total_batches == 0 {
            0.0
        } else {
            self.total_actions as f64 / self.total_batches as f64
        }
    }
}

// ── ActionBatcher ─────────────────────────────────────────────────────────────

/// Groups actions into time-windowed batches for efficient IPC.
///
/// The caller drives flushing by calling [`maybe_flush`] at regular intervals.
/// High-priority actions trigger immediate flush via [`enqueue`] returning
/// `Some(BatchPayload)`.
#[derive(Debug)]
pub struct ActionBatcher {
    queue: Vec<QueuedBatchItem>,
    active_batch_id: Option<String>,
    config: BatchingConfig,
    is_flushing: bool,
    last_flush_at: Option<Instant>,
    stats: BatchStats,
    /// Exposed for tests; use `stats().queue_limit` in production code.
    pub hard_queue_limit: usize,
    is_destroyed: bool,
    /// Items currently in-flight (drained but not yet acked). Restored on fail_batch.
    pending_batch_items: Vec<QueuedBatchItem>,
}

impl ActionBatcher {
    pub fn new(config: BatchingConfig) -> Self {
        let hard_queue_limit = (config.max_batch_size * 4).max(100);
        let stats = BatchStats {
            queue_limit: hard_queue_limit,
            ..Default::default()
        };
        Self {
            queue: Vec::new(),
            active_batch_id: None,
            config,
            is_flushing: false,
            last_flush_at: None,
            stats,
            hard_queue_limit,
            is_destroyed: false,
            pending_batch_items: Vec::new(),
        }
    }

    pub fn with_defaults() -> Self {
        Self::new(BatchingConfig::default())
    }

    /// Enqueue `action` with the given `priority`.
    ///
    /// If priority ≥ `priority_flush_threshold`, returns `Some(BatchPayload)`
    /// for the caller to send immediately (immediate-flush path).
    /// Otherwise returns `None` and the action waits for the next timed flush.
    ///
    /// Returns `Err` if the hard queue limit is reached.
    pub fn enqueue(
        &mut self,
        action: ZubridgeAction,
        priority: i32,
        parent_id: Option<String>,
    ) -> Result<Option<BatchPayload>, String> {
        if self.is_destroyed {
            return Err("ActionBatcher is destroyed".into());
        }

        let id = action
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        // Hard queue limit — prevents unbounded growth.
        if self.queue.len() >= self.hard_queue_limit {
            self.stats.rejected_actions += 1;
            return Err(format!(
                "ActionBatcher queue exceeded hard limit ({})",
                self.hard_queue_limit
            ));
        }

        let should_flush = self.should_flush_now(priority) && !self.is_flushing;

        if should_flush {
            // Insert at front for guaranteed inclusion in the immediate flush.
            self.queue.insert(
                0,
                QueuedBatchItem {
                    action,
                    id,
                    parent_id,
                    priority,
                },
            );
            return Ok(Some(self.take_batch_internal()));
        }

        // Normal enqueue.
        if self.queue.len() >= self.config.max_batch_size && !self.is_flushing {
            // Queue is full — flush now and then add.
            let batch = self.take_batch_internal();
            self.queue.push(QueuedBatchItem {
                action,
                id,
                parent_id,
                priority,
            });
            return Ok(Some(batch));
        }

        self.queue.push(QueuedBatchItem {
            action,
            id,
            parent_id,
            priority,
        });
        Ok(None)
    }

    /// Returns `true` if the flush window has elapsed and there are actions queued.
    ///
    /// Call this periodically (every `window_ms`) to drive timed flushing.
    pub fn maybe_flush(&mut self) -> Option<BatchPayload> {
        if self.is_flushing || self.queue.is_empty() || self.is_destroyed {
            return None;
        }
        let window = Duration::from_millis(self.config.window_ms);
        let should = self
            .last_flush_at
            .map(|t| t.elapsed() >= window)
            .unwrap_or(true); // first flush always triggers
        if should {
            Some(self.take_batch_internal())
        } else {
            None
        }
    }

    /// Acknowledge a completed batch. Marks any failed actions.
    ///
    /// Returns the IDs of successfully acknowledged actions.
    pub fn complete_batch(&mut self, ack: &BatchAckPayload) -> Vec<String> {
        if self.active_batch_id.as_deref() != Some(&ack.batch_id) {
            return Vec::new();
        }
        self.pending_batch_items.clear();
        self.is_flushing = false;
        self.active_batch_id = None;
        self.last_flush_at = Some(Instant::now());
        ack.results
            .iter()
            .filter(|r| r.success)
            .map(|r| r.action_id.clone())
            .collect()
    }

    /// Called when the batch send failed (e.g. IPC error). Restores the
    /// in-flight items to the front of the queue so the next flush retries them.
    pub fn fail_batch(&mut self, failed_batch_id: &str) {
        if self.active_batch_id.as_deref() != Some(failed_batch_id) {
            return;
        }
        let mut pending = std::mem::take(&mut self.pending_batch_items);
        pending.extend(self.queue.drain(..));
        self.queue = pending;
        self.is_flushing = false;
        self.active_batch_id = None;
    }

    pub fn stats(&self) -> BatchStats {
        BatchStats {
            current_queue_size: self.queue.len(),
            is_flushing: self.is_flushing,
            ..self.stats.clone()
        }
    }

    pub fn destroy(&mut self) {
        self.is_destroyed = true;
        self.queue.clear();
        self.pending_batch_items.clear();
        self.is_flushing = false;
        self.active_batch_id = None;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn should_flush_now(&self, priority: i32) -> bool {
        priority >= self.config.priority_flush_threshold
    }

    fn take_batch_internal(&mut self) -> BatchPayload {
        let batch: Vec<QueuedBatchItem> = self
            .queue
            .drain(..self.queue.len().min(self.config.max_batch_size))
            .collect();

        let batch_id = uuid::Uuid::new_v4().to_string();
        self.active_batch_id = Some(batch_id.clone());
        self.is_flushing = true;
        self.stats.total_batches += 1;
        self.stats.total_actions += batch.len() as u64;

        let actions = batch
            .iter()
            .map(|item| BatchActionEntry {
                id: item.id.clone(),
                parent_id: item.parent_id.clone(),
                action: item.action.clone(),
            })
            .collect();

        // Stash items so fail_batch can restore them if the IPC send fails.
        self.pending_batch_items = batch;

        BatchPayload { batch_id, actions }
    }
}

/// Compute the batching priority for an action.
///
/// Mirrors `calculatePriority` in `packages/electron/src/batching/ActionBatcher.ts`.
/// Note: the renderer doesn't have root-thunk context, so thunk actions default
/// to `PRIORITY_THUNK` rather than the context-sensitive `PRIORITY_ROOT_THUNK`.
pub fn calculate_priority(action: &ZubridgeAction) -> i32 {
    if action.immediate.unwrap_or(false) {
        return PRIORITY_IMMEDIATE;
    }
    if action.thunk_parent_id.is_some() {
        return PRIORITY_THUNK;
    }
    PRIORITY_NORMAL
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn action(t: &str) -> ZubridgeAction {
        ZubridgeAction {
            id: Some(uuid::Uuid::new_v4().to_string()),
            action_type: t.to_string(),
            payload: None,
            source_label: None,
            thunk_parent_id: None,
            immediate: None,
            keys: None,
            bypass_access_control: None,
            starts_thunk: None,
            ends_thunk: None,
        }
    }

    fn ack_ok(batch_id: &str, action_id: &str) -> BatchAckPayload {
        BatchAckPayload {
            batch_id: batch_id.to_string(),
            results: vec![BatchActionResult {
                action_id: action_id.to_string(),
                success: true,
                error: None,
            }],
            error: None,
        }
    }

    #[test]
    fn immediate_flush_on_high_priority() {
        let mut b = ActionBatcher::with_defaults();
        // PRIORITY_IMMEDIATE (100) >= priority_flush_threshold (80) → immediate flush.
        let result = b.enqueue(action("INC"), PRIORITY_IMMEDIATE, None).unwrap();
        assert!(result.is_some(), "expected immediate flush batch");
        let batch = result.unwrap();
        assert_eq!(batch.actions.len(), 1);
    }

    #[test]
    fn low_priority_action_enqueued_not_flushed() {
        let mut b = ActionBatcher::with_defaults();
        // PRIORITY_THUNK (50) < priority_flush_threshold (80) → queued.
        let result = b.enqueue(action("INC"), PRIORITY_THUNK, None).unwrap();
        assert!(result.is_none());
        assert_eq!(b.stats().current_queue_size, 1);
    }

    #[test]
    fn maybe_flush_drains_queue() {
        let mut b = ActionBatcher::new(BatchingConfig {
            window_ms: 0, // flush immediately
            ..BatchingConfig::default()
        });
        b.enqueue(action("A"), PRIORITY_THUNK, None).unwrap();
        b.enqueue(action("B"), PRIORITY_THUNK, None).unwrap();
        let batch = b.maybe_flush().expect("should flush");
        assert_eq!(batch.actions.len(), 2);
    }

    #[test]
    fn max_batch_size_respected() {
        let mut b = ActionBatcher::new(BatchingConfig {
            max_batch_size: 2,
            window_ms: 0,
            ..BatchingConfig::default()
        });
        for i in 0..5 {
            let _ = b.enqueue(action(&format!("A{i}")), PRIORITY_THUNK, None);
        }
        if let Some(batch) = b.maybe_flush() {
            assert!(batch.actions.len() <= 2, "batch exceeded max_batch_size");
        }
    }

    #[test]
    fn hard_limit_rejects_actions() {
        let mut b = ActionBatcher::with_defaults();
        let hard_limit = b.hard_queue_limit; // 100 with defaults (max(50*4,100))
        // Keep enqueueing until we get a rejection. We may need more than
        // `hard_limit` enqueues because flush-on-full empties the queue
        // periodically, but eventually we'll fill the queue without draining.
        // Mark is_flushing=true by simulating an in-flight batch so the
        // auto-flush path is skipped entirely.
        let _ = b.enqueue(action("PRIME"), PRIORITY_IMMEDIATE, None); // triggers flush → is_flushing=true
        // Now is_flushing=true so auto-flush won't fire; fill queue normally.
        let mut rejected = 0usize;
        for i in 0..=hard_limit {
            match b.enqueue(action(&format!("X{i}")), PRIORITY_THUNK, None) {
                Err(_) => {
                    rejected += 1;
                    break;
                }
                Ok(_) => {}
            }
        }
        assert_eq!(rejected, 1, "should reject exactly once at hard limit");
        assert!(b.stats().rejected_actions >= 1);
    }

    #[test]
    fn complete_batch_resets_flushing_state() {
        let mut b = ActionBatcher::with_defaults();
        let a = action("INC");
        let aid = a.id.clone().unwrap();
        let batch = b.enqueue(a, PRIORITY_IMMEDIATE, None).unwrap().unwrap();
        assert!(b.is_flushing);
        b.complete_batch(&ack_ok(&batch.batch_id, &aid));
        assert!(!b.is_flushing);
    }

    #[test]
    fn second_immediate_action_queued_when_flush_in_flight() {
        let mut b = ActionBatcher::with_defaults();
        // First high-priority action → immediate flush, is_flushing = true.
        let batch1 = b.enqueue(action("A"), PRIORITY_IMMEDIATE, None).unwrap().unwrap();
        assert!(b.is_flushing);
        // Second high-priority action arrives before ack — must NOT overwrite pending_batch_items.
        let result2 = b.enqueue(action("B"), PRIORITY_IMMEDIATE, None).unwrap();
        assert!(result2.is_none(), "second immediate action must queue, not flush, while in-flight");
        assert_eq!(b.stats().current_queue_size, 1);
        // fail_batch still recovers the original items.
        b.fail_batch(&batch1.batch_id);
        assert_eq!(b.stats().current_queue_size, 2); // original + queued B
    }

    #[test]
    fn fail_batch_requeues_items() {
        let mut b = ActionBatcher::with_defaults();
        let a = action("INC");
        let aid = a.id.clone().unwrap();
        let batch = b.enqueue(a, PRIORITY_IMMEDIATE, None).unwrap().unwrap();
        assert_eq!(b.stats().current_queue_size, 0);
        b.fail_batch(&batch.batch_id);
        assert!(!b.is_flushing);
        assert_eq!(b.stats().current_queue_size, 1);
        assert_eq!(b.queue[0].id, aid);
    }

    #[test]
    fn calculate_priority_non_thunk_returns_priority_normal() {
        use crate::action::PRIORITY_NORMAL;
        let a = action("INC");
        assert_eq!(calculate_priority(&a), PRIORITY_NORMAL);
    }

    #[test]
    fn destroy_clears_queue() {
        let mut b = ActionBatcher::with_defaults();
        b.enqueue(action("A"), PRIORITY_THUNK, None).unwrap();
        b.destroy();
        assert_eq!(b.stats().current_queue_size, 0);
        let result = b.enqueue(action("B"), PRIORITY_THUNK, None);
        assert!(result.is_err());
    }
}
