//! WebSocket server for broadcasting log entries to clients
//!
//! This module provides a WebSocket server that broadcasts log entries to connected clients
//! using the MessagePack format for efficient serialization.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info};
use serde::Serialize;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::{
    accept_async,
    tungstenite::Message,
};

use crate::{Error, Result};
use crate::logging::LogEntry;

/// Maximum size of the broadcast channel
const BROADCAST_CHANNEL_SIZE: usize = 1024;

/// WebSocket server for broadcasting log entries
pub struct WebSocketServer {
    /// Port to listen on
    port: u16,

    /// Broadcast channel for sending messages to clients
    sender: broadcast::Sender<Vec<u8>>,

    /// Connected clients
    clients: Arc<RwLock<HashMap<SocketAddr, broadcast::Receiver<Vec<u8>>>>>,

    /// Log history reference
    log_history: Arc<RwLock<Vec<LogEntry>>>,
}

impl WebSocketServer {
    /// Create a new WebSocket server
    pub fn new(port: u16, log_history: Arc<RwLock<Vec<LogEntry>>>) -> Self {
        let (sender, _) = broadcast::channel(BROADCAST_CHANNEL_SIZE);

        Self {
            port,
            sender,
            clients: Arc::new(RwLock::new(HashMap::new())),
            log_history,
        }
    }

    /// Start the WebSocket server
    pub async fn start(&self) -> Result<()> {
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&addr).await.map_err(|e| Error::WebSocket(e.to_string()))?;

        info!("WebSocket server listening on {}", addr);

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

            // Handle each connection in a separate task
            tokio::spawn(async move {
                if let Err(e) = Self::handle_connection(socket, addr, clients, sender, log_history).await {
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
        log_history: Arc<RwLock<Vec<LogEntry>>>,
    ) -> Result<()> {
        // Accept the WebSocket connection
        let ws_stream = accept_async(socket).await.map_err(|e| Error::WebSocket(e.to_string()))?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        // Add client to connected clients
        let mut receiver = sender.subscribe();
        {
            let mut clients = clients.write().await;
            clients.insert(addr, sender.subscribe());
        }

        // Send initial history
        let history = log_history.read().await.clone();
        let msg = Self::serialize_to_messagepack(&history)?;
        ws_sender.send(Message::Binary(msg)).await.map_err(|e| Error::WebSocket(e.to_string()))?;

        // Handle incoming messages (ping/pong)
        let client_task = tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(msg) => {
                        if msg.is_ping() {
                            if let Err(e) = ws_sender.send(Message::Pong(vec![])).await {
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
                    Ok(msg) => {
                        if let Err(e) = ws_sender.send(Message::Binary(msg)).await {
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
        let binary = Self::serialize_to_messagepack(msg)?;

        // Send the message to all clients
        if let Err(e) = self.sender.send(binary) {
            error!("Error broadcasting message: {}", e);
        }

        Ok(())
    }

    /// Serialize a message to MessagePack
    fn serialize_to_messagepack<T: Serialize>(msg: &T) -> Result<Vec<u8>> {
        rmp_serde::to_vec(msg).map_err(Error::MessagePack)
    }
}
