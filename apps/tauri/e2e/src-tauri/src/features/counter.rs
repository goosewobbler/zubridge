use super::state::BaseState;

/// Pure counter mutations. Each mode wires these into its preferred dispatch
/// shape (match-arm, handler map, reducer, etc.) but the maths are shared.
pub fn increment(state: &mut BaseState) {
    state.counter = state.counter.saturating_add(1);
}

pub fn decrement(state: &mut BaseState) {
    state.counter = state.counter.saturating_sub(1);
}

pub fn set(state: &mut BaseState, value: i32) {
    state.counter = value;
}

pub fn double(state: &mut BaseState) {
    state.counter = state.counter.saturating_mul(2);
}

pub fn halve(state: &mut BaseState) {
    // Mirror the JS `Math.round(x / 2)` behavior so test fixtures match.
    let value = state.counter;
    let half = (value as f64) / 2.0;
    state.counter = half.round() as i32;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::theme::Theme;

    fn fresh(counter: i32) -> BaseState {
        BaseState {
            counter,
            theme: Theme::Dark,
            filler: None,
        }
    }

    #[test]
    fn increment_decrement_round_trip() {
        let mut s = fresh(5);
        increment(&mut s);
        assert_eq!(s.counter, 6);
        decrement(&mut s);
        assert_eq!(s.counter, 5);
    }

    #[test]
    fn set_replaces_counter() {
        let mut s = fresh(10);
        set(&mut s, 42);
        assert_eq!(s.counter, 42);
    }

    #[test]
    fn double_and_halve_round_to_nearest() {
        let mut s = fresh(7);
        double(&mut s);
        assert_eq!(s.counter, 14);
        halve(&mut s);
        assert_eq!(s.counter, 7);

        let mut s = fresh(5);
        halve(&mut s); // 2.5 -> 3 (banker's rounding in Rust would give 2; we use .round())
        assert_eq!(s.counter, 3);
    }
}
