use std::time::Duration;

use serde_json::{json, Value};
use uuid::Uuid;
use zubridge_middleware::{Action, ZubridgeMiddlewareConfig, LoggingConfig, init_middleware};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    env_logger::init_from_env(
        env_logger::Env::default().default_filter_or("info")
    );

    println!("Zubridge Middleware Example with Performance Tracking");
    println!("====================================================");

    // Create middleware configuration with performance measurement enabled
    let config = ZubridgeMiddlewareConfig {
        logging: LoggingConfig {
            enabled: true,
            websocket_port: Some(9000), // Start WebSocket server on port 9000
            console_output: true,
            measure_performance: true, // Enable performance measurement
            performance: Some(zubridge_middleware::logging::PerformanceConfig {
                enabled: true,
                detail: zubridge_middleware::logging::PerformanceDetail::High,
                include_in_logs: true,
                record_timings: true,
                verbose_output: true,
            }),
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
        },
        "performance": {
            "last_action_time": null,
            "history": []
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
            id: Some(Uuid::new_v4().to_string()),
            source_window_id: Some(1),
        },
        Action {
            action_type: "theme.toggle".to_string(),
            payload: None,
            id: Some(Uuid::new_v4().to_string()),
            source_window_id: Some(1),
        },
        Action {
            action_type: "counter.set".to_string(),
            payload: Some(json!(42)),
            id: Some(Uuid::new_v4().to_string()),
            source_window_id: Some(1),
        },
        Action {
            action_type: "counter.decrement".to_string(),
            payload: Some(json!(1)),
            id: Some(Uuid::new_v4().to_string()),
            source_window_id: Some(1),
        },
        // Add a slow action to demonstrate performance difference
        Action {
            action_type: "counter.increment_slow".to_string(),
            payload: Some(json!({ "delay_ms": 500 })), // 500ms delay
            id: Some(Uuid::new_v4().to_string()),
            source_window_id: Some(1),
        },
    ];

    // Simulate IPC flow for each action
    for i in 0..10 {
        let action_index = i % actions.len();
        let mut action = actions[action_index].clone();
        
        // Generate a new ID for each action
        action.id = Some(Uuid::new_v4().to_string());
        
        println!("Dispatching: {} (ID: {})", action.action_type, action.id.as_ref().unwrap());

        // 1. Track action dispatch (simulating renderer process)
        let start_time = std::time::Instant::now();
        println!("1. Action dispatched from renderer");
        middleware.track_action_dispatch(&action).await?;
        
        // Simulate network delay (IPC from renderer to main)
        tokio::time::sleep(Duration::from_millis(5)).await;
        
        // 2. Track action received (simulating main process)
        println!("2. Action received in main process");
        middleware.track_action_received(&action).await?;
        
        // 3. Process the action
        println!("3. Processing action");
        middleware.process_action(action.clone()).await?;

        // 4. Update the state based on the action (simulating a reducer)
        println!("4. Updating state based on action");
        let current_state = middleware.get_state().await;
        let new_state = handle_action(current_state, &action)?;
        middleware.set_state(new_state.clone()).await?;
        
        // 5. Track state update
        println!("5. State updated");
        middleware.track_state_update(&action, &new_state).await?;
        
        // 6. Track action acknowledgment (simulating IPC back to renderer)
        println!("6. Acknowledging action back to renderer");
        if let Some(action_id) = &action.id {
            middleware.track_action_acknowledged(action_id).await?;
        }
        
        // Log performance info
        let elapsed = start_time.elapsed();
        println!("Total time: {:.2?}", elapsed);
        println!("------------------------------------");

        // Wait a bit before next action
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    Ok(())
}

// Simple reducer function to handle actions
fn handle_action(state: Value, action: &Action) -> Result<Value, Box<dyn std::error::Error>> {
    let mut new_state = state.clone();

    // Start timing
    let start_time = std::time::Instant::now();
    
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
        "counter.increment_slow" => {
            // Simulate a slow operation
            if let Some(delay) = action.payload.as_ref()
                .and_then(|p| p.get("delay_ms"))
                .and_then(|d| d.as_u64()) {
                println!("  Simulating slow operation ({} ms)...", delay);
                // Busy wait to simulate CPU-bound work
                let wait_until = std::time::Instant::now() + Duration::from_millis(delay);
                while std::time::Instant::now() < wait_until {
                    // Do nothing
                }
            }
            
            // Then increment
            let current = new_state["counter"].as_i64().unwrap_or(0);
            new_state["counter"] = json!(current + 1);
        },
        _ => {
            println!("Unknown action type: {}", action.action_type);
        }
    }
    
    // Record the processing time in the state
    let elapsed = start_time.elapsed();
    new_state["performance"]["last_action_time"] = json!(elapsed.as_millis());
    
    // Add to history (keep last 5 entries)
    let history = new_state["performance"]["history"].as_array_mut().unwrap();
    history.push(json!({
        "action_type": action.action_type,
        "time_ms": elapsed.as_millis()
    }));
    
    if history.len() > 5 {
        *history = history.split_off(history.len() - 5);
    }

    Ok(new_state)
}
