//! Transaction management for IPC performance tracking
//!
//! This module provides functionality for tracking performance metrics
//! across IPC boundaries and cleaning up old transaction data.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use log::{debug, warn};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tokio::time::interval;

use crate::{Error, Result};
use crate::metrics::Metrics;
use crate::PerformanceTransaction;

/// Configuration for transaction tracking
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    /// Maximum age of transactions before cleanup (in seconds)
    #[serde(default = "default_max_age")]
    pub max_age_seconds: u64,

    /// Maximum number of transactions to keep in memory
    #[serde(default = "default_max_transactions")]
    pub max_transactions: usize,

    /// How frequently to run cleanup (in seconds)
    #[serde(default = "default_cleanup_interval")]
    pub cleanup_interval_seconds: u64,
}

fn default_max_age() -> u64 {
    300 // 5 minutes
}

fn default_max_transactions() -> usize {
    1000
}

fn default_cleanup_interval() -> u64 {
    60 // 1 minute
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_age_seconds: default_max_age(),
            max_transactions: default_max_transactions(),
            cleanup_interval_seconds: default_cleanup_interval(),
        }
    }
}

/// Transaction manager for tracking IPC performance metrics
pub struct TransactionManager {
    /// Map of action IDs to transaction data
    transactions: Arc<RwLock<HashMap<String, PerformanceTransaction>>>,
    
    /// Configuration for the transaction manager
    config: Config,
}

impl TransactionManager {
    /// Create a new transaction manager with the default configuration
    pub fn new() -> Self {
        Self::with_config(Config::default())
    }
    
    /// Create a new transaction manager with a custom configuration
    pub fn with_config(config: Config) -> Self {
        let transactions = Arc::new(RwLock::new(HashMap::with_capacity(100)));
        
        // Start the cleanup task
        Self::start_cleanup_task(transactions.clone(), config.clone());
        
        Self {
            transactions,
            config,
        }
    }
    
    /// Get a reference to the transaction storage
    pub fn get_transaction_store(&self) -> Arc<RwLock<HashMap<String, PerformanceTransaction>>> {
        self.transactions.clone()
    }
    
    /// Record the start of a transaction (action dispatch)
    pub async fn record_dispatch(&self, action_id: &str, action_type: &str) -> Result<()> {
        let now = Self::current_timestamp()?;
        
        let mut transactions = self.transactions.write().await;
        transactions.insert(action_id.to_string(), PerformanceTransaction {
            action_type: action_type.to_string(),
            action_id: Some(action_id.to_string()),
            dispatch_timestamp: now,
            receive_timestamp: None,
            state_update_timestamp: None,
            acknowledge_timestamp: None,
        });
        
        debug!("Recorded dispatch for action {} (type: {})", action_id, action_type);
        Ok(())
    }
    
    /// Record when an action is received in the main process
    pub async fn record_receive(&self, action_id: &str, action_type: &str) -> Result<()> {
        let now = Self::current_timestamp()?;
        
        let mut transactions = self.transactions.write().await;
        if let Some(transaction) = transactions.get_mut(action_id) {
            transaction.receive_timestamp = Some(now);
            debug!("Recorded receive for action {} (type: {})", action_id, action_type);
        } else {
            // Create a new transaction if it doesn't exist
            transactions.insert(action_id.to_string(), PerformanceTransaction {
                action_type: action_type.to_string(),
                action_id: Some(action_id.to_string()),
                dispatch_timestamp: now, // Use current time as dispatch time as a fallback
                receive_timestamp: Some(now),
                state_update_timestamp: None,
                acknowledge_timestamp: None,
            });
            debug!("Created new transaction on receive for action {} (type: {})", action_id, action_type);
        }
        
        Ok(())
    }
    
    /// Record when state is updated after an action
    pub async fn record_state_update(&self, action_id: &str) -> Result<()> {
        let now = Self::current_timestamp()?;
        
        let mut transactions = self.transactions.write().await;
        if let Some(transaction) = transactions.get_mut(action_id) {
            transaction.state_update_timestamp = Some(now);
            debug!("Recorded state update for action {}", action_id);
        } else {
            debug!("No transaction found for state update of action {}", action_id);
        }
        
        Ok(())
    }
    
    /// Record when an action is acknowledged
    pub async fn record_acknowledgement(&self, action_id: &str) -> Result<()> {
        let now = Self::current_timestamp()?;
        
        let mut transactions = self.transactions.write().await;
        if let Some(transaction) = transactions.get_mut(action_id) {
            transaction.acknowledge_timestamp = Some(now);
            debug!("Recorded acknowledgement for action {}", action_id);
        } else {
            debug!("No transaction found for acknowledgement of action {}", action_id);
        }
        
        Ok(())
    }
    
    /// Calculate metrics from a transaction, with proper error handling
    pub async fn calculate_metrics(&self, action_id: &str) -> Result<Option<Metrics>> {
        let transactions = self.transactions.read().await;
        
        if let Some(transaction) = transactions.get(action_id) {
            // Safety check for timestamps
            let ack_timestamp = transaction.acknowledge_timestamp.ok_or_else(|| {
                Error::MissingData(format!("Missing acknowledgement timestamp for action {}", action_id))
            })?;
            
            let receive_timestamp = transaction.receive_timestamp.ok_or_else(|| {
                Error::MissingData(format!("Missing receive timestamp for action {}", action_id))
            })?;
            
            // Calculate timing metrics
            let dispatch_to_receive = (receive_timestamp as f64 - transaction.dispatch_timestamp as f64) / 1_000_000.0;
            
            let receive_to_update = transaction.state_update_timestamp
                .map(|update_timestamp| (update_timestamp as f64 - receive_timestamp as f64) / 1_000_000.0)
                .unwrap_or(0.0);
                
            let update_to_ack = transaction.state_update_timestamp
                .map(|update_timestamp| (ack_timestamp as f64 - update_timestamp as f64) / 1_000_000.0)
                .unwrap_or_else(|| (ack_timestamp as f64 - receive_timestamp as f64) / 1_000_000.0);
                
            let total_time = (ack_timestamp as f64 - transaction.dispatch_timestamp as f64) / 1_000_000.0;
            
            if total_time < 0.0 || dispatch_to_receive < 0.0 || receive_to_update < 0.0 || update_to_ack < 0.0 {
                warn!("Negative time calculated for action {}, timestamps may be invalid", action_id);
                return Ok(None);
            }
            
            Ok(Some(Metrics {
                total_ms: total_time,
                deserialization_ms: Some(dispatch_to_receive),
                action_processing_ms: Some(receive_to_update),
                state_update_ms: Some(update_to_ack),
                serialization_ms: None,
            }))
        } else {
            debug!("No transaction found for action ID: {}", action_id);
            Ok(None)
        }
    }
    
    /// Get a transaction by action ID
    pub async fn get_transaction(&self, action_id: &str) -> Option<PerformanceTransaction> {
        let transactions = self.transactions.read().await;
        transactions.get(action_id).cloned()
    }
    
    /// Get the current transaction count - useful for monitoring
    pub async fn transaction_count(&self) -> usize {
        let transactions = self.transactions.read().await;
        transactions.len()
    }
    
    /// Start a background task to periodically clean up old transactions
    fn start_cleanup_task(transactions: Arc<RwLock<HashMap<String, PerformanceTransaction>>>, config: Config) {
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(config.cleanup_interval_seconds));
            
            loop {
                interval.tick().await;
                
                let max_age_nanos = config.max_age_seconds as u128 * 1_000_000_000;
                let now = match SystemTime::now()
                    .duration_since(UNIX_EPOCH) {
                        Ok(d) => d.as_nanos(),
                        Err(e) => {
                            warn!("Error getting current time for cleanup: {}", e);
                            continue;
                        }
                    };
                
                let mut to_remove = Vec::new();
                
                // Identify old transactions
                {
                    let tx_store = transactions.read().await;
                    for (action_id, tx) in tx_store.iter() {
                        // Check if the transaction is complete or timed out
                        let is_complete = tx.acknowledge_timestamp.is_some();
                        let age = now.saturating_sub(tx.dispatch_timestamp);
                        
                        if is_complete && age > max_age_nanos {
                            // Remove completed transactions older than max_age
                            to_remove.push(action_id.clone());
                        } else if age > max_age_nanos * 2 {
                            // Remove any transaction older than 2*max_age regardless of state
                            to_remove.push(action_id.clone());
                            warn!("Removing incomplete transaction {} after extended timeout", action_id);
                        }
                    }
                }
                
                // Remove identified transactions
                if !to_remove.is_empty() {
                    let mut tx_store = transactions.write().await;
                    let before_count = tx_store.len();
                    
                    for action_id in to_remove {
                        tx_store.remove(&action_id);
                    }
                    
                    let removed = before_count - tx_store.len();
                    if removed > 0 {
                        debug!("Cleaned up {} old transactions", removed);
                    }
                }
                
                // Check if we need to enforce max transactions limit
                {
                    let mut tx_store = transactions.write().await;
                    if tx_store.len() > config.max_transactions {
                        // Convert to vector for sorting
                        let mut tx_vec: Vec<(String, PerformanceTransaction)> = tx_store
                            .drain()
                            .collect();
                        
                        // Sort by dispatch timestamp (oldest first)
                        tx_vec.sort_by_key(|(_, tx)| tx.dispatch_timestamp);
                        
                        let excess = tx_vec.len() - config.max_transactions;
                        debug!("Removing {} excess transactions to stay under limit", excess);
                        
                        // Keep only the newest transactions up to the limit
                        tx_vec.truncate(config.max_transactions);
                        
                        // Convert back to HashMap
                        *tx_store = tx_vec.into_iter().collect();
                    }
                }
            }
        });
    }
    
    /// Helper to get the current timestamp in nanoseconds
    fn current_timestamp() -> Result<u128> {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .map_err(|e| Error::TimestampError(e.to_string()))
    }
} 