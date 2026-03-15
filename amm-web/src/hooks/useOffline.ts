/**
 * useOffline — detects when the user loses connectivity or the node is unreachable.
 */

import { useState, useEffect, useRef } from 'react';
import { config } from '../config';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [nodeDown, setNodeDown] = useState(false);
  const checkTimer = useRef<number>();

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Periodically check node health
  useEffect(() => {
    async function checkNode() {
      try {
        const res = await fetch(`${config.nodeUrl}/blocks/height`, { signal: AbortSignal.timeout(5000) });
        setNodeDown(!res.ok);
      } catch {
        setNodeDown(true);
      }
    }
    checkNode();
    checkTimer.current = window.setInterval(checkNode, 30000);
    return () => clearInterval(checkTimer.current);
  }, []);

  return { isOffline, nodeDown, showBanner: isOffline || nodeDown };
}
