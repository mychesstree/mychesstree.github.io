export type EngineCallback = (line: string) => void;

export class ChessEngine {
  private worker: Worker | null = null;
  private onReady: (() => void) | null = null;
  private listeners: Set<EngineCallback> = new Set();

  constructor(onReady?: () => void) {
    this.onReady = onReady || null;
    this.init();
  }

  private init() {
    try {
      this.worker = new Worker('/stockfish.js');
      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        
        if (line === 'readyok' && this.onReady) {
          this.onReady();
          this.onReady = null; // only call once
        }
        
        // Notify all current listeners
        this.listeners.forEach(cb => cb(line));
      };

      this.sendCommand('uci');
      this.sendCommand('isready');
    } catch (err) {
      console.error('Failed to initialize Stockfish worker:', err);
    }
  }

  public sendCommand(cmd: string) {
    if (this.worker) {
      this.worker.postMessage(cmd);
    }
  }

  /**
   * Send a command and wait for a specific completion condition or single response.
   * Note: This is a simplified version. For complex "onDone" patterns, we track the line.
   */
  public send(cmd: string, onDone?: EngineCallback, onStream?: EngineCallback) {
    const listener = (line: string) => {
      if (onStream) onStream(line);
      
      // Traditional 'done' indicators in UCI
      if (line.startsWith('bestmove') || line === 'readyok') {
        if (onDone) onDone(line);
        this.listeners.delete(listener);
      }
    };

    this.listeners.add(listener);
    this.sendCommand(cmd);
  }

  public terminate() {
    this.worker?.terminate();
    this.listeners.clear();
  }
}

/**
 * React hook to manage engine lifecycle
 */
import { useEffect, useRef } from 'react';

export function useEngine(onReady?: () => void) {
  const engineRef = useRef<ChessEngine | null>(null);

  useEffect(() => {
    engineRef.current = new ChessEngine(onReady);
    return () => engineRef.current?.terminate();
  }, []);

  return engineRef.current;
}
