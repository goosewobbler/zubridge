//! WebSocket server for broadcasting log entries to clients
//!
//! This module provides a WebSocket server that broadcasts log entries to connected clients
//! using either JSON or MessagePack format for serialization.

use std::net::SocketAddr;
use std::sync::Arc;
use std::collections::HashMap;

use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info};
use serde::Serialize;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};

use crate::{Error, Result, SerializationFormat, TelemetryEntry};
use crate::serialization;

/// Maximum size of the broadcast channel
const BROADCAST_CHANNEL_SIZE: usize = 1024;

/// WebSocket server for broadcasting log entries
pub struct WebSocketServer {
    /// Port to listen on
    port: u16,

    /// Address to bind to
    bind_address: String,

    /// Broadcast channel for sending messages to clients
    sender: broadcast::Sender<Vec<u8>>,

    /// Connected clients
    clients: Arc<RwLock<HashMap<SocketAddr, broadcast::Receiver<Vec<u8>>>>>,

    /// Log history reference
    log_history: Arc<RwLock<Vec<TelemetryEntry>>>,

    /// Serialization format to use
    serialization_format: SerializationFormat,
}

impl WebSocketServer {
    /// Create a new WebSocket server
    pub fn new(port: u16, log_history: Arc<RwLock<Vec<TelemetryEntry>>>, serialization_format: SerializationFormat) -> Self {
        let (sender, _) = broadcast::channel(BROADCAST_CHANNEL_SIZE);

        Self {
            port,
            bind_address: "127.0.0.1".to_string(), // Default to localhost for security
            sender,
            clients: Arc::new(RwLock::new(HashMap::new())),
            log_history,
            serialization_format,
        }
    }

    /// Set the bind address
    pub fn with_bind_address(mut self, address: &str) -> Self {
        self.bind_address = address.to_string();
        self
    }

    /// Start the WebSocket server
    pub async fn start(&self) -> Result<()> {
        // Bind to configured address
        let addr = format!("{}:{}", self.bind_address, self.port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                // If binding fails and we're not already using the default localhost,
                // try to fall back to localhost
                if self.bind_address != "127.0.0.1" {
                    log::warn!("Failed to bind to {}: {}. Falling back to localhost", addr, e);
                    let fallback_addr = format!("127.0.0.1:{}", self.port);
                    TcpListener::bind(&fallback_addr).await
                        .map_err(|e| Error::WebSocket(format!("WebSocket server bind failed (tried original and fallback): {}", e)))?
                } else {
                    return Err(Error::WebSocket(format!("WebSocket server bind failed: {}", e)));
                }
            }
        };

        info!("WebSocket server listening on {} with {:?} serialization",
              addr, self.serialization_format);

        loop {
            let (socket, addr) = match listener.accept().await {
                Ok(client) => client,
                Err(e) => {
                    error!("Error accepting connection: {}", e);
                    continue;
                }
            };

            debug!("New WebSocket connection from {}", addr);

            let clients = self.clients.clone();
            let sender = self.sender.clone();
            let log_history = self.log_history.clone();
            let serialization_format = self.serialization_format.clone();

            // Handle each connection in a separate task
            tokio::spawn(async move {
                if let Err(e) = Self::handle_connection(
                    socket, addr, clients, sender, log_history, serialization_format
                ).await {
                    error!("Error handling WebSocket connection: {}", e);
                }
            });
        }
    }

    /// Handle a WebSocket connection
    async fn handle_connection(
        socket: TcpStream,
        addr: SocketAddr,
        clients: Arc<RwLock<HashMap<SocketAddr, broadcast::Receiver<Vec<u8>>>>>,
        sender: broadcast::Sender<Vec<u8>>,
        log_history: Arc<RwLock<Vec<TelemetryEntry>>>,
        serialization_format: SerializationFormat,
    ) -> Result<()> {
        // Accept the WebSocket connection
        let ws_stream = accept_async(socket).await.map_err(|e| Error::WebSocket(e.to_string()))?;

        // Clone the stream instead of splitting it - this way we can use it in both tasks
        let (ws_sender1, mut ws_receiver) = ws_stream.split();

        // Create an Arc for the sender to share between tasks
        let ws_sender1 = Arc::new(tokio::sync::Mutex::new(ws_sender1));

        // Add client to connected clients
        let mut receiver = sender.subscribe();
        {
            let mut clients = clients.write().await;
            clients.insert(addr, sender.subscribe());
        }

        // Send initial history
        let history = log_history.read().await.clone();
        let (_format_name, serialized) = serialization::serialize(&history, &convert_format(&serialization_format))?;

        // Create the correct message type based on serialization format
        let msg = if serialization_format == SerializationFormat::Json {
            Message::Text(String::from_utf8_lossy(&serialized).to_string())
        } else {
            Message::Binary(serialized)
        };

        ws_sender1.lock().await.send(msg).await.map_err(|e| Error::WebSocket(e.to_string()))?;

        // Create a clone for the client task
        let ws_sender2 = ws_sender1.clone();

        // Handle incoming messages (ping/pong)
        let client_task = tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(msg) => {
                        if msg.is_ping() {
                            let mut lock = ws_sender2.lock().await;
                            if let Err(e) = lock.send(Message::Pong(vec![])).await {
                                error!("Error sending pong: {}", e);
                                break;
                            }
                        } else if msg.is_close() {
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Error receiving message: {}", e);
                        break;
                    }
                }
            }

            debug!("WebSocket connection closed: {}", addr);
            Ok::<_, Error>(())
        });

        // Listen for broadcast messages
        let broadcast_task = tokio::spawn(async move {
            loop {
                match receiver.recv().await {
                    Ok(binary_data) => {
                        let mut lock = ws_sender1.lock().await;

                        // Directly use the message (already serialized during broadcast)
                        let msg = if serialization_format == SerializationFormat::Json {
                            Message::Text(String::from_utf8_lossy(&binary_data).to_string())
                        } else {
                            Message::Binary(binary_data)
                        };

                        if let Err(e) = lock.send(msg).await {
                            error!("Error sending message: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Error receiving broadcast: {}", e);
                        break;
                    }
                }
            }

            debug!("WebSocket broadcast listener stopped: {}", addr);
            Ok::<_, Error>(())
        });

        // Wait for either task to complete
        tokio::select! {
            result = client_task => {
                if let Err(e) = result {
                    error!("Client task error: {}", e);
                }
            }
            result = broadcast_task => {
                if let Err(e) = result {
                    error!("Broadcast task error: {}", e);
                }
            }
        }

        // Remove client from connected clients
        {
            let mut clients = clients.write().await;
            clients.remove(&addr);
        }

        debug!("WebSocket connection handler completed: {}", addr);
        Ok(())
    }

    /// Broadcast a message to all connected clients
    pub async fn broadcast<T: Serialize>(&self, msg: &T) -> Result<()> {
        // Log for diagnostic purposes
        log::debug!("WebSocketServer::broadcast called");
        
        // Check if we have clients before attempting serialization
        let clients = self.clients.read().await;
        log::debug!("WebSocketServer::broadcast found {} clients", clients.len());
        if clients.is_empty() {
            log::debug!("No WebSocket clients connected, skipping broadcast");
            return Ok(());
        }
        
        // For very detailed debugging
        #[cfg(debug_assertions)]
        {
            if let Ok(raw_json) = serde_json::to_string(msg) {
                log::debug!("WebSocket attempting to broadcast message: {}", raw_json);
        }
        }
        
        // Use the serialization module to serialize the message
        log::debug!("Using serialization format: {:?}", self.serialization_format);
        match serialization::serialize(msg, &convert_format(&self.serialization_format)) {
            Ok((_format_name, serialized)) => {
                log::debug!("Successfully serialized message, size: {} bytes", serialized.len());
                
                // Use the broadcast sender to send to all clients at once
                match self.sender.send(serialized) {
                    Ok(receivers) => {
                        log::debug!("Successfully broadcast message to {} receivers", receivers);
                    },
                    Err(e) => {
                        log::error!("Error broadcasting message: {}", e);
                    }
                }
            },
            Err(e) => {
                log::error!("Error serializing message: {}", e);
            }
        }
        
        log::debug!("Broadcast complete");
        Ok(())
    }
}

/// Convert from SerializationFormat to serialization::Format
fn convert_format(format: &crate::SerializationFormat) -> serialization::Format {
        match format {
        crate::SerializationFormat::Json => serialization::Format::Json,
        crate::SerializationFormat::MessagePack => serialization::Format::MessagePack,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PerformanceMetrics;
    use crate::TelemetryEntryType;
    use chrono::Utc;
    use serde_json::json;
    use tokio::runtime::Runtime;

    #[test]
    fn test_message_serialization() {
        // Create test metrics
        let metrics = PerformanceMetrics {
            total_ms: 15.5,
            deserialization_ms: Some(2.0),
            action_processing_ms: Some(10.0),
            state_update_ms: Some(3.0),
            serialization_ms: Some(0.5),
        };

        // Create test entry
        let entry = TelemetryEntry {
            timestamp: Utc::now(),
            entry_type: TelemetryEntryType::StateUpdated,
            action: Some(crate::Action {
                action_type: "TEST".to_string(),
                payload: Some(json!({"value": 42})),
                id: None,
                source_window_id: None,
            }),
            state: Some(json!({"counter": 42})),
            state_summary: None,
            state_delta: None,
            context_id: "test-1".to_string(),
            processing_metrics: Some(metrics),
        };

        // Test serialization using the serialization module
        let format = serialization::Format::Json;
        let (_, json_bytes) = serialization::serialize(&entry, &format).unwrap();
        let json_str = String::from_utf8(json_bytes).unwrap();

        // Verify the serialization is correct
        assert!(json_str.contains("\"total_ms\":15.5"));
        assert!(!json_str.contains("\"total_ms\":\"15.5\""));
    }
}
