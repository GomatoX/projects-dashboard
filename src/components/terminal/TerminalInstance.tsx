'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalInstanceProps {
  projectId: string;
  sessionId: string;
  onExit?: (exitCode?: number) => void;
}

export function TerminalInstance({
  projectId,
  sessionId,
  onExit,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputBufferRef = useRef<string[]>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Batched input sender — reduces HTTP requests for fast typing
  const flushInput = useCallback(async () => {
    if (inputBufferRef.current.length === 0) return;
    const data = inputBufferRef.current.join('');
    inputBufferRef.current = [];

    try {
      await fetch(`/api/projects/${projectId}/terminal/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, data }),
      });
    } catch {
      // Ignore input errors
    }
  }, [projectId, sessionId]);

  // Send resize to server
  const sendResize = useCallback(
    async (cols: number, rows: number) => {
      try {
        await fetch(`/api/projects/${projectId}/terminal/resize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, cols, rows }),
        });
      } catch {
        // Ignore resize errors
      }
    },
    [projectId, sessionId],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, monospace',
      lineHeight: 1.2,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit();
      sendResize(term.cols, term.rows);
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle input — buffer and flush
    term.onData((data) => {
      inputBufferRef.current.push(data);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushInput, 10);
    });

    // Connect to SSE stream for output
    const es = new EventSource(
      `/api/projects/${projectId}/terminal/stream?sessionId=${sessionId}`,
    );
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'output') {
          term.write(parsed.data);
        } else if (parsed.type === 'exit') {
          const code = typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined;
          term.writeln(
            `\r\n\x1b[90m[Process exited${code !== undefined ? ` with code ${code}` : ''}]\x1b[0m`,
          );
          onExit?.(code);
        }
      } catch {
        // Ignore parse errors
      }
    };

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          sendResize(term.cols, term.rows);
        } catch {
          // Ignore fit errors during cleanup
        }
      });
    });

    resizeObserver.observe(containerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      es.close();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      term.dispose();
    };
  }, [projectId, sessionId, flushInput, sendResize, onExit]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        padding: 4,
      }}
    />
  );
}
