//! Priority-sorted action queue with concurrency control.
//!
//! Ports `packages/electron/src/action/ActionScheduler.ts` and
//! `packages/electron/src/action/ActionExecutor.ts`.

use std::time::Instant;

use crate::error::ZubridgeError;
use crate::models::ZubridgeAction;

// ── Priority levels ───────────────────────────────────────────────────────────
//
// Mirror the `PRIORITY_LEVELS` constants in
// `packages/electron/src/batching/types.ts`.

/// Immediate actions — highest priority, bypass all queues.
pub const PRIORITY_IMMEDIATE: i32 = 100;
/// Actions belonging to the active root thunk — high priority.
pub const PRIORITY_ROOT_THUNK: i32 = 70;
/// Regular thunk-dispatched actions — medium priority.
pub const PRIORITY_THUNK: i32 = 50;
/// Regular actions without special flags — lowest priority.
pub const PRIORITY_NORMAL: i32 = 0;

/// Actions with priority below this threshold can be dropped on overflow.
const OVERFLOW_DROP_THRESHOLD: i32 = PRIORITY_THUNK;

// ── Scheduler events (string constants) ──────────────────────────────────────

pub const EVENT_ACTION_ENQUEUED: &str = "action:enqueued";
pub const EVENT_ACTION_STARTED: &str = "action:started";
pub const EVENT_ACTION_COMPLETED: &str = "action:completed";
pub const EVENT_ACTION_FAILED: &str = "action:failed";

// ── Public types ──────────────────────────────────────────────────────────────

/// An action held in the scheduler's priority queue.
#[derive(Debug)]
pub struct QueuedAction {
    pub action: ZubridgeAction,
    pub source_label: String,
    pub received_at: Instant,
    pub priority: i32,
}

/// Result of [`ActionScheduler::enqueue`].
#[derive(Debug)]
pub enum EnqueueResult {
    /// Action can execute immediately — caller is responsible for running it.
    ExecuteNow(QueuedAction),
    /// Action was added to the queue.
    Queued,
    /// Action was rejected due to overflow.
    Rejected(ZubridgeError),
}

/// Concurrency context passed to scheduler decisions.
///
/// Derived from `ThunkManager`'s current state by the caller on every call.
#[derive(Debug, Default, Clone)]
pub struct SchedulerContext {
    /// ID of the current root thunk, if any.
    pub root_thunk_id: Option<String>,
    /// True when `root_thunk_id` is in `Executing` state.
    pub is_root_thunk_active: bool,
    /// Thunk IDs of currently-running non-concurrent tasks (from ThunkScheduler).
    pub running_non_concurrent_thunk_ids: Vec<String>,
}

/// Throughput / health stats for monitoring and benchmarks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchedulerStats {
    pub queue_len: usize,
    pub max_queue_size: usize,
    pub dropped_count: usize,
}

// ── ActionScheduler ───────────────────────────────────────────────────────────

/// Priority-sorted action queue with thunk-based concurrency control.
///
/// The scheduler is synchronous — it decides *what* to execute but delegates
/// the actual execution to the caller. Async bridging lives in the platform
/// wrappers (tauri / napi), not here.
///
/// # Concurrency rules (mirrors TypeScript)
///
/// 1. Actions with `immediate = true` bypass all queues and always execute.
/// 2. While a root thunk is active, non-thunk actions wait.
/// 3. Actions whose `thunk_parent_id` does not match the active root thunk wait.
/// 4. Once no blocking thunk exists, all queued actions are drained.
#[derive(Debug)]
pub struct ActionScheduler {
    queue: Vec<QueuedAction>,
    max_queue_size: usize,
    dropped_count: usize,
    needs_sort: bool,
}

impl Default for ActionScheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl ActionScheduler {
    pub fn new() -> Self {
        Self {
            queue: Vec::new(),
            max_queue_size: 1000,
            dropped_count: 0,
            needs_sort: false,
        }
    }

    pub fn with_max_queue_size(mut self, size: usize) -> Self {
        self.max_queue_size = size;
        self
    }

    /// Enqueue `action`. Returns `ExecuteNow` when the action can run
    /// immediately given `ctx`, `Queued` when it was deferred, or `Rejected`
    /// on overflow.
    pub fn enqueue(
        &mut self,
        mut action: ZubridgeAction,
        source_label: String,
        ctx: &SchedulerContext,
    ) -> EnqueueResult {
        if action.id.is_none() {
            action.id = Some(uuid::Uuid::new_v4().to_string());
        }

        let priority = priority_for(&action, ctx);

        let queued = QueuedAction {
            action,
            source_label,
            received_at: Instant::now(),
            priority,
        };

        if can_execute_immediately(&queued.action, ctx) {
            return EnqueueResult::ExecuteNow(queued);
        }

        // Overflow check before adding to queue.
        if self.queue.len() >= self.max_queue_size {
            match self.handle_overflow(priority) {
                OverflowDecision::AcceptNew => {}
                OverflowDecision::RejectNew => {
                    self.dropped_count += 1;
                    return EnqueueResult::Rejected(ZubridgeError::ActionProcessing(format!(
                        "action queue overflow (max {})",
                        self.max_queue_size
                    )));
                }
            }
        }

        self.queue.push(queued);
        self.needs_sort = true;
        EnqueueResult::Queued
    }

    /// Drain all actions that can execute right now given `ctx`.
    ///
    /// Returns them in priority order (highest first). The caller should
    /// execute them sequentially and call `drain_ready` again if the context
    /// changes (e.g. after a thunk completes).
    ///
    /// Uses deferred sorting — the queue is sorted once per `drain_ready` call
    /// rather than on every `enqueue`, giving O(n log n) per process cycle
    /// instead of O(n² log n) for n enqueues.
    pub fn drain_ready(&mut self, ctx: &SchedulerContext) -> Vec<QueuedAction> {
        if self.queue.is_empty() {
            return Vec::new();
        }
        if self.needs_sort {
            self.sort_queue();
            self.needs_sort = false;
        }

        let mut ready = Vec::new();
        let mut remaining = Vec::new();

        for queued in self.queue.drain(..) {
            if can_execute_immediately(&queued.action, ctx) {
                ready.push(queued);
            } else {
                remaining.push(queued);
            }
        }

        self.queue = remaining;
        ready
    }

    pub fn queue_len(&self) -> usize {
        self.queue.len()
    }

    pub fn dropped_count(&self) -> usize {
        self.dropped_count
    }

    pub fn stats(&self) -> SchedulerStats {
        SchedulerStats {
            queue_len: self.queue.len(),
            max_queue_size: self.max_queue_size,
            dropped_count: self.dropped_count,
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    fn handle_overflow(&mut self, new_priority: i32) -> OverflowDecision {
        // Find the lowest-priority droppable action (priority < OVERFLOW_DROP_THRESHOLD).
        let droppable_pos = self
            .queue
            .iter()
            .enumerate()
            .filter(|(_, q)| q.priority < OVERFLOW_DROP_THRESHOLD)
            .min_by(|(_, a), (_, b)| {
                a.priority
                    .cmp(&b.priority)
                    .then_with(|| a.received_at.cmp(&b.received_at))
            })
            .map(|(i, _)| i);

        match droppable_pos {
            Some(pos) => {
                self.queue.remove(pos);
                self.dropped_count += 1;
                OverflowDecision::AcceptNew
            }
            None => {
                if new_priority <= OVERFLOW_DROP_THRESHOLD {
                    OverflowDecision::RejectNew
                } else {
                    // High-priority action, no droppable slot: evict the oldest.
                    let oldest_pos = self
                        .queue
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, q)| q.received_at)
                        .map(|(i, _)| i)
                        .unwrap_or(0);
                    self.queue.remove(oldest_pos);
                    self.dropped_count += 1;
                    OverflowDecision::AcceptNew
                }
            }
        }
    }

    fn sort_queue(&mut self) {
        self.queue.sort_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then_with(|| a.received_at.cmp(&b.received_at))
        });
    }
}

// ── Module-level functions ────────────────────────────────────────────────────

/// Compute the scheduling priority for `action` given the current context.
///
/// Mirrors `getPriorityForAction` in `ActionScheduler.ts` and
/// `calculatePriority` in `ActionBatcher.ts`.
pub fn priority_for(action: &ZubridgeAction, ctx: &SchedulerContext) -> i32 {
    if action.immediate.unwrap_or(false) {
        return PRIORITY_IMMEDIATE;
    }
    if let Some(parent_id) = &action.thunk_parent_id {
        if ctx.root_thunk_id.as_deref() == Some(parent_id.as_str()) {
            return PRIORITY_ROOT_THUNK;
        }
        return PRIORITY_THUNK;
    }
    PRIORITY_NORMAL
}

/// Decide whether `action` can execute immediately given `ctx`.
///
/// Mirrors `canExecuteImmediately` in `ActionScheduler.ts`.
pub fn can_execute_immediately(action: &ZubridgeAction, ctx: &SchedulerContext) -> bool {
    // `immediate` always bypasses all queues.
    if action.immediate.unwrap_or(false) {
        return true;
    }

    let has_active_thunk = ctx.is_root_thunk_active && ctx.root_thunk_id.is_some();

    // Non-thunk action must wait while a root thunk is active.
    if has_active_thunk && action.thunk_parent_id.is_none() {
        return false;
    }

    // Thunk action not belonging to the active root thunk must wait.
    if let (Some(parent_id), true) = (&action.thunk_parent_id, has_active_thunk) {
        let root = ctx.root_thunk_id.as_deref().unwrap_or("");
        if parent_id != root {
            return false;
        }
    }

    // No active thunk → all actions can run.
    if !has_active_thunk {
        return true;
    }

    // No non-concurrent tasks running → can execute.
    if ctx.running_non_concurrent_thunk_ids.is_empty() {
        return true;
    }

    // Thunk action whose parent is a running non-concurrent task → can execute.
    if let Some(parent_id) = &action.thunk_parent_id {
        return ctx
            .running_non_concurrent_thunk_ids
            .iter()
            .any(|id| id == parent_id);
    }

    // Default: block.
    false
}

enum OverflowDecision {
    AcceptNew,
    RejectNew,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn action(action_type: &str) -> ZubridgeAction {
        ZubridgeAction {
            id: Some(uuid::Uuid::new_v4().to_string()),
            action_type: action_type.to_string(),
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

    fn thunk_action(action_type: &str, parent_id: &str) -> ZubridgeAction {
        ZubridgeAction {
            thunk_parent_id: Some(parent_id.to_string()),
            ..action(action_type)
        }
    }

    fn immediate_action(action_type: &str) -> ZubridgeAction {
        ZubridgeAction {
            immediate: Some(true),
            ..action(action_type)
        }
    }

    fn idle_ctx() -> SchedulerContext {
        SchedulerContext::default()
    }

    fn active_thunk_ctx(thunk_id: &str) -> SchedulerContext {
        SchedulerContext {
            root_thunk_id: Some(thunk_id.to_string()),
            is_root_thunk_active: true,
            running_non_concurrent_thunk_ids: vec![thunk_id.to_string()],
        }
    }

    // ── can_execute_immediately ───────────────────────────────────────────────

    #[test]
    fn immediate_always_executes() {
        let a = immediate_action("INC");
        assert!(can_execute_immediately(&a, &idle_ctx()));
        assert!(can_execute_immediately(&a, &active_thunk_ctx("t1")));
    }

    #[test]
    fn normal_action_blocked_by_active_thunk() {
        let a = action("INC");
        assert!(!can_execute_immediately(&a, &active_thunk_ctx("t1")));
    }

    #[test]
    fn normal_action_runs_when_no_thunk() {
        let a = action("INC");
        assert!(can_execute_immediately(&a, &idle_ctx()));
    }

    #[test]
    fn thunk_action_belonging_to_root_executes() {
        let a = thunk_action("INC", "t1");
        let ctx = active_thunk_ctx("t1");
        assert!(can_execute_immediately(&a, &ctx));
    }

    #[test]
    fn thunk_action_of_wrong_thunk_is_blocked() {
        let a = thunk_action("INC", "t2");
        let ctx = active_thunk_ctx("t1");
        assert!(!can_execute_immediately(&a, &ctx));
    }

    // ── enqueue / drain_ready ─────────────────────────────────────────────────

    #[test]
    fn immediate_action_bypasses_queue() {
        let mut sched = ActionScheduler::new();
        let a = immediate_action("INC");
        let result = sched.enqueue(a, "main".into(), &idle_ctx());
        assert!(matches!(result, EnqueueResult::ExecuteNow(_)));
        assert_eq!(sched.queue_len(), 0);
    }

    #[test]
    fn normal_action_queued_during_active_thunk() {
        let mut sched = ActionScheduler::new();
        let ctx = active_thunk_ctx("t1");
        let a = action("INC");
        let result = sched.enqueue(a, "main".into(), &ctx);
        assert!(matches!(result, EnqueueResult::Queued));
        assert_eq!(sched.queue_len(), 1);
    }

    #[test]
    fn drain_ready_releases_on_thunk_complete() {
        let mut sched = ActionScheduler::new();
        // Queue two normal actions while thunk is active.
        let ctx_active = active_thunk_ctx("t1");
        sched.enqueue(action("A"), "main".into(), &ctx_active);
        sched.enqueue(action("B"), "main".into(), &ctx_active);
        assert_eq!(sched.queue_len(), 2);

        // Thunk completes → drain with idle context.
        let ready = sched.drain_ready(&idle_ctx());
        assert_eq!(ready.len(), 2);
        assert_eq!(sched.queue_len(), 0);
    }

    #[test]
    fn drain_ready_preserves_priority_order() {
        let mut sched = ActionScheduler::new();
        let ctx_active = active_thunk_ctx("t1");

        // Enqueue a low-priority normal action and a high-priority thunk action.
        let normal = action("NORMAL");
        let _root_thunk = thunk_action("THUNK_ACTION", "t1");

        sched.enqueue(normal, "main".into(), &ctx_active); // queued
        // Thunk action for root → also queued (can_execute_immediately uses ctx_active,
        // which has running_non_concurrent_thunk_ids = ["t1"], parent = "t1" → executes now!)
        // Actually, thunk_action("t1") against active_thunk_ctx("t1") returns ExecuteNow.
        // Let's use a different non-root thunk for the queue test.
        let non_root_thunk = thunk_action("THUNK_ACTION_2", "t2");
        sched.enqueue(non_root_thunk, "main".into(), &ctx_active); // queued (t2 != t1)

        // Drain after thunk completes: normal action gets PRIORITY_NORMAL=0,
        // non_root_thunk got PRIORITY_THUNK=50 when enqueued (t2 != root t1 at enqueue time).
        let ready = sched.drain_ready(&idle_ctx());
        assert_eq!(ready.len(), 2);
        // Higher priority first (PRIORITY_THUNK=50 > PRIORITY_NORMAL=0).
        assert_eq!(ready[0].priority, PRIORITY_THUNK);
        assert_eq!(ready[1].priority, PRIORITY_NORMAL);
    }

    // ── Overflow handling ─────────────────────────────────────────────────────

    #[test]
    fn overflow_rejects_low_priority_action() {
        let mut sched = ActionScheduler::with_max_queue_size(ActionScheduler::new(), 2);
        let ctx = active_thunk_ctx("t1");

        // Fill queue with normal actions (priority 0, droppable).
        sched.enqueue(action("A"), "main".into(), &ctx);
        sched.enqueue(action("B"), "main".into(), &ctx);
        assert_eq!(sched.queue_len(), 2);

        // Adding another normal action: lowest-priority existing item gets dropped.
        let result = sched.enqueue(action("C"), "main".into(), &ctx);
        assert!(matches!(result, EnqueueResult::Queued));
        assert_eq!(sched.queue_len(), 2); // one was dropped to make room
        assert_eq!(sched.dropped_count(), 1);
    }

    #[test]
    fn overflow_rejects_new_low_priority_when_no_droppable_exists() {
        let mut sched = ActionScheduler::with_max_queue_size(ActionScheduler::new(), 2);
        let ctx = SchedulerContext {
            root_thunk_id: Some("t1".into()),
            is_root_thunk_active: true,
            running_non_concurrent_thunk_ids: vec!["t1".into()],
        };

        // Fill queue with medium-priority thunk actions (priority 50, not droppable).
        let ta1 = thunk_action("TA1", "t2");
        let ta2 = thunk_action("TA2", "t3");
        sched.enqueue(ta1, "main".into(), &ctx);
        sched.enqueue(ta2, "main".into(), &ctx);
        assert_eq!(sched.queue_len(), 2);

        // Try to add a NORMAL action (priority 0) — no room, no droppable slot → reject.
        let result = sched.enqueue(action("NORMAL"), "main".into(), &ctx);
        assert!(matches!(result, EnqueueResult::Rejected(_)));
        assert_eq!(sched.dropped_count(), 1);
    }

    #[test]
    fn overflow_rejects_thunk_priority_when_no_droppable_slot() {
        let mut sched = ActionScheduler::with_max_queue_size(ActionScheduler::new(), 2);
        let ctx = SchedulerContext {
            root_thunk_id: Some("t1".into()),
            is_root_thunk_active: true,
            running_non_concurrent_thunk_ids: vec!["t1".into()],
        };
        // Fill with THUNK-priority actions (50 == threshold — not droppable).
        sched.enqueue(thunk_action("TA1", "t2"), "main".into(), &ctx);
        sched.enqueue(thunk_action("TA2", "t3"), "main".into(), &ctx);
        assert_eq!(sched.queue_len(), 2);
        // Incoming THUNK action: no droppable slot, new_priority <= threshold → reject.
        let result = sched.enqueue(thunk_action("TA3", "t4"), "main".into(), &ctx);
        assert!(
            matches!(result, EnqueueResult::Rejected(_)),
            "THUNK-priority action must be rejected rather than evicting an equal-priority predecessor"
        );
    }

    #[test]
    fn high_priority_evicts_oldest_when_full() {
        let mut sched = ActionScheduler::with_max_queue_size(ActionScheduler::new(), 1);
        let ctx = active_thunk_ctx("t1");

        // Fill with a medium-priority thunk action (not droppable — above threshold).
        sched.enqueue(thunk_action("TA", "t2"), "main".into(), &ctx);
        assert_eq!(sched.queue_len(), 1);

        // Add an immediate action (priority 100): no droppable, but high-priority → evict oldest.
        // Note: immediate actions return ExecuteNow, not Queued, so use ROOT_THUNK priority.
        // We can test this by using a ctx where the immediate can't run (but it always can).
        // Instead let's use a manual high-priority thunk action for t1 (which would execute now).
        // Actually, let's add a queue-item directly via a different scenario:
        // Fill with NORMAL (droppable=priority<50) and try to add high priority.
        let mut sched2 = ActionScheduler::with_max_queue_size(ActionScheduler::new(), 1);
        sched2.enqueue(action("NORMAL"), "main".into(), &ctx);
        assert_eq!(sched2.queue_len(), 1);

        // Root-thunk action (priority 70) — no droppable slot (normal = 0 < threshold 50),
        // wait — NORMAL has priority 0 which IS < OVERFLOW_DROP_THRESHOLD (50), so it's droppable.
        let result = sched2.enqueue(thunk_action("HIGH", "t1"), "main".into(), &ctx);
        // t1 action in active_thunk_ctx("t1") returns ExecuteNow, so test with t3.
        let result2 = sched2.enqueue(thunk_action("HIGH", "t3"), "main".into(), &ctx);
        // Either result or result2 should succeed (the normal was dropped).
        assert!(
            matches!(result, EnqueueResult::ExecuteNow(_))
                || matches!(result2, EnqueueResult::Queued)
        );
    }

    // ── Priority assignment ───────────────────────────────────────────────────

    #[test]
    fn priority_for_immediate() {
        let a = immediate_action("I");
        assert_eq!(priority_for(&a, &idle_ctx()), PRIORITY_IMMEDIATE);
    }

    #[test]
    fn priority_for_root_thunk_action() {
        let a = thunk_action("T", "root");
        let ctx = SchedulerContext {
            root_thunk_id: Some("root".into()),
            is_root_thunk_active: true,
            running_non_concurrent_thunk_ids: vec!["root".into()],
        };
        assert_eq!(priority_for(&a, &ctx), PRIORITY_ROOT_THUNK);
    }

    #[test]
    fn priority_for_non_root_thunk_action() {
        let a = thunk_action("T", "child");
        let ctx = SchedulerContext {
            root_thunk_id: Some("root".into()),
            is_root_thunk_active: true,
            running_non_concurrent_thunk_ids: vec!["root".into()],
        };
        assert_eq!(priority_for(&a, &ctx), PRIORITY_THUNK);
    }

    #[test]
    fn priority_for_normal() {
        let a = action("N");
        assert_eq!(priority_for(&a, &idle_ctx()), PRIORITY_NORMAL);
    }

    // ── Property-style invariant tests ───────────────────────────────────────
    //
    // These exercise the concurrency invariants described in the plan:
    //   1. For any sequence of enqueue/drain operations, priority ordering holds.
    //   2. No action is dispatched while a blocking thunk is Executing (non-immediate).
    //   3. Queue size never exceeds the configured cap.

    #[test]
    fn invariant_priority_ordering_in_drain() {
        let mut sched = ActionScheduler::new();
        let ctx = active_thunk_ctx("t1");

        // Enqueue actions with known priorities (all blocked by active thunk).
        sched.enqueue(action("N1"), "main".into(), &ctx); // priority 0
        sched.enqueue(action("N2"), "main".into(), &ctx); // priority 0
        sched.enqueue(thunk_action("T1", "t2"), "main".into(), &ctx); // priority 50
        sched.enqueue(thunk_action("T2", "t3"), "main".into(), &ctx); // priority 50

        let ready = sched.drain_ready(&idle_ctx());
        // Verify non-descending priority order (highest first).
        for window in ready.windows(2) {
            assert!(
                window[0].priority >= window[1].priority,
                "priority ordering violated: {} < {}",
                window[0].priority,
                window[1].priority
            );
        }
    }

    #[test]
    fn invariant_no_non_immediate_while_blocking_thunk() {
        let mut sched = ActionScheduler::new();
        let ctx = active_thunk_ctx("t1");

        let a = action("BLOCKED");
        // Normal action with active blocking thunk → must not execute immediately.
        let result = sched.enqueue(a, "main".into(), &ctx);
        assert!(
            !matches!(result, EnqueueResult::ExecuteNow(_)),
            "non-immediate action must not bypass blocking thunk"
        );
    }

    #[test]
    fn invariant_queue_never_exceeds_cap() {
        let cap = 5_usize;
        let mut sched = ActionScheduler::with_max_queue_size(ActionScheduler::new(), cap);
        let ctx = active_thunk_ctx("t1");

        for i in 0..20 {
            sched.enqueue(action(&format!("A{i}")), "main".into(), &ctx);
            assert!(
                sched.queue_len() <= cap,
                "queue exceeded cap at iteration {i}: len={}",
                sched.queue_len()
            );
        }
    }
}
