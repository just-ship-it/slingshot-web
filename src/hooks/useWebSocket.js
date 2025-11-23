import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

/**
 * Custom hook for managing WebSocket connections with Socket.io
 * Provides real-time communication with the Slingshot backend
 */
export const useWebSocket = (url, options = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  const {
    onConnect,
    onDisconnect,
    onError,
    onWebhookReceived,
    onOrderPlaced,
    onMarketData,
    onOrderUpdate,
    onPositionUpdate,
    autoConnect = true,
    reconnection = true,
    reconnectionAttempts = 5,
    reconnectionDelay = 1000
  } = options;

  useEffect(() => {
    if (!autoConnect) return;

    // Create socket connection
    const socket = io(url, {
      reconnection,
      reconnectionAttempts,
      reconnectionDelay,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      setIsConnected(true);
      setError(null);
      onConnect?.(socket);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      setIsConnected(false);
      onDisconnect?.(reason, socket);
    });

    socket.on('connect_error', (err) => {
      console.error('🚨 WebSocket connection error:', err.message);
      setError(err.message);
      setIsConnected(false);
      onError?.(err, socket);
    });

    // Custom event handlers for Slingshot events
    socket.on('webhook_received', (data) => {
      console.log('📨 Webhook received:', data);
      setLastMessage({ type: 'webhook_received', data, timestamp: Date.now() });
      onWebhookReceived?.(data, socket);
    });

    socket.on('webhook_error', (data) => {
      console.error('🚨 Webhook error:', data);
      setLastMessage({ type: 'webhook_error', data, timestamp: Date.now() });
      setError(`Webhook error: ${data.error}`);
    });

    socket.on('order_placed', (data) => {
      console.log('📋 Order placed:', data);
      setLastMessage({ type: 'order_placed', data, timestamp: Date.now() });
      onOrderPlaced?.(data, socket);
    });

    socket.on('order_update', (data) => {
      console.log('📋 Order update:', data);
      setLastMessage({ type: 'order_update', data, timestamp: Date.now() });
      onOrderUpdate?.(data, socket);
    });

    socket.on('position_update', (data) => {
      console.log('📍 Position update:', data);
      setLastMessage({ type: 'position_update', data, timestamp: Date.now() });
      onPositionUpdate?.(data, socket);
    });

    socket.on('market_data', (data) => {
      console.log('📊 Market data:', data);
      setLastMessage({ type: 'market_data', data, timestamp: Date.now() });
      onMarketData?.(data, socket);
    });

    socket.on('account_update', (data) => {
      console.log('👤 Account update:', data);
      setLastMessage({ type: 'account_update', data, timestamp: Date.now() });
    });

    socket.on('pnl_update', (data) => {
      console.log('💰 P&L update:', data);
      setLastMessage({ type: 'pnl_update', data, timestamp: Date.now() });
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, [url, autoConnect, onConnect, onDisconnect, onError, onWebhookReceived, onOrderPlaced, onMarketData, onOrderUpdate, onPositionUpdate, reconnection, reconnectionAttempts, reconnectionDelay]);

  // Manual connection control
  const connect = () => {
    if (socketRef.current && !isConnected) {
      socketRef.current.connect();
    }
  };

  const disconnect = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.disconnect();
    }
  };

  // Send message to server
  const emit = (event, data) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
      return true;
    }
    console.warn('⚠️ Cannot emit: WebSocket not connected');
    return false;
  };

  // Subscribe to specific events
  const subscribe = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      return () => socketRef.current.off(event, callback);
    }
    return () => {};
  };

  // Unsubscribe from events
  const unsubscribe = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  // Subscribe to account-specific updates
  const subscribeToAccount = (accountId) => {
    return emit('subscribe_account', accountId);
  };

  // Subscribe to symbol quotes
  const subscribeToQuote = (symbol) => {
    return emit('subscribe_quote', symbol);
  };

  // Send ping to check connection
  const ping = () => {
    if (isConnected) {
      const startTime = Date.now();
      socketRef.current.emit('ping', { timestamp: startTime });

      const handlePong = (data) => {
        const latency = Date.now() - startTime;
        console.log(`🏓 Pong received, latency: ${latency}ms`);
        socketRef.current.off('pong', handlePong);
      };

      socketRef.current.on('pong', handlePong);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    error,
    lastMessage,
    connect,
    disconnect,
    emit,
    subscribe,
    unsubscribe,
    subscribeToAccount,
    subscribeToQuote,
    ping,

    // Helper methods for common operations
    ready: isConnected && !error,
    connectionStatus: isConnected ? 'connected' : 'disconnected',

    // Message history (last 10 messages)
    clearError: () => setError(null)
  };
};

/**
 * Hook for managing WebSocket message history
 */
export const useWebSocketMessages = (maxMessages = 50) => {
  const [messages, setMessages] = useState([]);

  const addMessage = (message) => {
    setMessages(prev => [
      ...prev.slice(-(maxMessages - 1)),
      {
        ...message,
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString()
      }
    ]);
  };

  const clearMessages = () => setMessages([]);

  const getMessagesByType = (type) => {
    return messages.filter(msg => msg.type === type);
  };

  const getRecentMessages = (count = 10) => {
    return messages.slice(-count);
  };

  return {
    messages,
    addMessage,
    clearMessages,
    getMessagesByType,
    getRecentMessages,
    count: messages.length
  };
};

export default useWebSocket;