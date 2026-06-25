// Re-export from zubridge_core so existing code in desktop.rs and commands/
// can continue using `crate::core::*` without modification.
pub use zubridge_core::deltas::{DeltaCalculator, DeltaResult};
pub use zubridge_core::orchestration::ActionQueueManager;
pub use zubridge_core::state::StateManagerHandle;
pub use zubridge_core::subscription::SubscriptionManager;
pub use zubridge_core::thunk::{StateUpdateTracker, ThunkRegistry};

// Sub-module shims so `crate::core::state_manager` paths still resolve.
pub mod state_manager {
    pub use zubridge_core::state::*;
}

pub mod delta {
    pub use zubridge_core::deltas::*;
}

pub mod subscription {
    pub use zubridge_core::subscription::*;
}

pub mod thunk_manager {
    pub use zubridge_core::thunk::*;
}
