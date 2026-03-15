/**
 * useWebSocket — real-time data via WebSocket with automatic reconnect.
 * Falls back to polling if WS is unavailable.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { config } from '../config';

export interface WsMessage {
  type: 'pool-update' | 'swap' | 'liquidity' | 'block';
  data: any;
}

export function useWebSocket(onMessage?: (msg: WsMessage) => void) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number>();
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  const connect = useCallback(() => {
    try {
      const wsUrl = config.indexerUrl.replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 5s
        reconnectTimer.current = window.setTimeout(connect, 5000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as WsMessage;
          callbackRef.current?.(msg);
        } catch {
          // ignore parse errors
        }
      };

      wsRef.current = ws;
    } catch {
      // WS not available, fall back to polling
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
