// ─── Permission Store ──────────────────────────────────────
// In-memory pending permission requests.
// When canUseTool needs approval, it stores a Promise resolver here.
// When the client POSTs to /permission, it resolves that Promise.

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  createdAt: number;
}

const pendingPermissions = new Map<string, PendingPermission>();

/**
 * Create a pending permission request and return a Promise that resolves
 * when the user approves or denies it.
 */
export function createPermissionRequest(
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown>,
  title?: string,
  description?: string,
): Promise<PermissionResult> {
  return new Promise<PermissionResult>((resolve) => {
    pendingPermissions.set(toolUseId, {
      resolve,
      toolName,
      input,
      title,
      description,
      createdAt: Date.now(),
    });

    // Auto-timeout after 5 minutes (deny if no response)
    setTimeout(() => {
      if (pendingPermissions.has(toolUseId)) {
        pendingPermissions.delete(toolUseId);
        resolve({ behavior: 'deny', message: 'Permission request timed out' });
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Resolve a pending permission request (called by the client POST).
 */
export function resolvePermission(
  toolUseId: string,
  decision: 'allow' | 'deny',
): boolean {
  const pending = pendingPermissions.get(toolUseId);
  if (!pending) return false;

  pendingPermissions.delete(toolUseId);
  if (decision === 'allow') {
    pending.resolve({ behavior: 'allow' });
  } else {
    pending.resolve({ behavior: 'deny', message: 'User denied permission' });
  }
  return true;
}

/**
 * Get info about a pending permission (for debugging).
 */
export function getPendingCount(): number {
  return pendingPermissions.size;
}
