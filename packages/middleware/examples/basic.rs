use std::time::Duration;

use serde_json::{json, Value};
use zubridge_middleware::{Action, ZubridgeMiddlewareConfig, LoggingConfig, init_middleware};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init_from_env(
        env_logger::Env::default().default_filter_or("info")
    );

    println!("Zubridge Middleware Example");
    println!("===========================");

    // Create middleware configuration
    let config = ZubridgeMiddlewareConfig {
        logging: LoggingConfig {
            enabled: true,
            websocket_port: Some(9000), // Start WebSocket server on port 9000
            console_output: true,
            ..Default::default()
        },
    };

    // Initialize middleware
    let middleware = init_middleware(config);

    // Set initial state
    middleware.set_state(json!({
        "counter": 0,
        "theme": {
            "is_dark": false
        }
    })).await?;

    println!("WebSocket server running on ws://localhost:9000");
    println!("Dispatching actions every 2 seconds...");
    println!("Press Ctrl+C to exit");

    // Example actions
    let actions = vec![
        Action {
            action_type: "counter.increment".to_string(),
            payload: Some(json!(1)),
        },
        Action {
            action_type: "theme.toggle".to_string(),
            payload: None,
        },
        Action {
            action_type: "counter.set".to_string(),
            payload: Some(json!(42)),
        },
        Action {
            action_type: "counter.decrement".to_string(),
            payload: Some(json!(1)),
        },
    ];

    // Process a few actions
    for i in 0..20 {
        let action = &actions[i % actions.len()];
        println!("Dispatching: {}", action.action_type);

        // Process the action
        middleware.process_action(action.clone()).await?;

        // Update the state based on the action (simulating a reducer)
        let current_state = middleware.get_state().await;
        let new_state = handle_action(current_state, action)?;
        middleware.set_state(new_state).await?;

        // Wait a bit
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    Ok(())
}

// Simple reducer function to handle actions
fn handle_action(state: Value, action: &Action) -> Result<Value, Box<dyn std::error::Error>> {
    let mut new_state = state.clone();

    match action.action_type.as_str() {
        "counter.increment" => {
            let increment = action.payload.as_ref().and_then(|p| p.as_i64()).unwrap_or(1);
            let current = new_state["counter"].as_i64().unwrap_or(0);
            new_state["counter"] = json!(current + increment);
        },
        "counter.decrement" => {
            let decrement = action.payload.as_ref().and_then(|p| p.as_i64()).unwrap_or(1);
            let current = new_state["counter"].as_i64().unwrap_or(0);
            new_state["counter"] = json!(current - decrement);
        },
        "counter.set" => {
            if let Some(value) = action.payload.as_ref().and_then(|p| p.as_i64()) {
                new_state["counter"] = json!(value);
            }
        },
        "theme.toggle" => {
            let is_dark = new_state["theme"]["is_dark"].as_bool().unwrap_or(false);
            new_state["theme"]["is_dark"] = json!(!is_dark);
        },
        _ => {
            println!("Unknown action type: {}", action.action_type);
        }
    }

    Ok(new_state)
}
