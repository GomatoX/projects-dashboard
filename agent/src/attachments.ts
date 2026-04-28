import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClaudeAttachment } from '../../src/lib/socket/types.js';

/**
 * Where to drop downloaded attachments on the device. We use the OS temp
 * directory partitioned by chatId — each chat gets its own folder so two
 * concurrent sessions can't clobber each other's filenames, and cleanup
 * is the OS's problem (nobody wants to write a TTL sweeper for a dev
 * tool). Files are named exactly as the dashboard stored them, which
 * preserves the nanoid prefix that already makes collisions impossible.
 */
function localPath(chatId: string, filename: string): string {
  return join(tmpdir(), 'dev-dashboard-agent', 'attachments', chatId, filename);
}

interface FetchArgs {
  dashboardUrl: string;
  /** Agent token from .env — sent as Bearer auth on the agent-only
   *  download endpoint (`/api/agent/attachments/...`), which is excluded
   *  from the dashboard's session-cookie middleware. */
  agentToken: string;
  /** Currently unused on this endpoint (the URL only needs chatId), but
   *  kept in the signature so we can switch back to the project-scoped
   *  user endpoint later without another agent rollout. */
  projectId: string;
  chatId: string;
  attachments: ClaudeAttachment[];
}

/**
 * Result of `fetchAttachments`. `pathByPlaceholder` maps the literal token
 * (`__ATTACHMENT_0__`) → the on-disk absolute path the SDK should see.
 * Caller does the prompt rewrite via plain string `split/join`; keeping
 * that step out of this module makes it trivial to unit-test the rewrite
 * separately from the network I/O.
 */
export interface FetchedAttachments {
  pathByPlaceholder: Record<string, string>;
}

/**
 * Download every attachment listed in the CLAUDE_QUERY payload to the
 * device's temp directory. Sequential by design — these are tiny files
 * (screenshots, PDFs) and we'd rather have predictable error messages
 * than save 50ms with Promise.all.
 *
 * Throws on the first failure; the caller emits CLAUDE_ERROR rather than
 * silently running the SDK with unresolved placeholders. A surprised
 * "where is the screenshot?" reply is worse than a clean error.
 */
export async function fetchAttachments(args: FetchArgs): Promise<FetchedAttachments> {
  const { dashboardUrl, agentToken, projectId, chatId, attachments } = args;
  const pathByPlaceholder: Record<string, string> = {};

  const baseDir = join(tmpdir(), 'dev-dashboard-agent', 'attachments', chatId);
  await mkdir(baseDir, { recursive: true });

  for (const att of attachments) {
    // The agent-only endpoint exists precisely so this fetch isn't
    // intercepted by the dashboard's session-cookie middleware. Bearer
    // auth is mandatory there — see verifyAgentBearer.
    void projectId; // reserved for future scoping (see FetchArgs)
    const url =
      `${dashboardUrl.replace(/\/$/, '')}` +
      `/api/agent/attachments` +
      `/${encodeURIComponent(chatId)}` +
      `/${encodeURIComponent(att.filename)}`;

    console.log(`[fetchAttachments] GET ${url}`);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${agentToken}`,
      },
    });

    if (!res.ok) {
      // Read body so we can include the server's error reason in the
      // thrown message (the dashboard returns plain text on 401/404,
      // which is hugely useful when chasing config typos).
      let bodyPreview = '';
      try {
        bodyPreview = (await res.text()).slice(0, 200);
      } catch {
        // ignore
      }
      throw new Error(
        `Failed to fetch attachment ${att.name} (${att.filename}): ` +
          `${res.status} ${res.statusText}` +
          (bodyPreview ? ` — ${bodyPreview}` : ''),
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const dest = localPath(chatId, att.filename);
    await writeFile(dest, buf);
    pathByPlaceholder[att.placeholder] = dest;
  }

  return { pathByPlaceholder };
}

/**
 * Replace every `__ATTACHMENT_<index>__` token in the prompt with its
 * device-local absolute path. Pure string operation — no I/O — so safe
 * to call after the (possibly rejected) download step.
 */
export function rewritePromptPlaceholders(
  prompt: string,
  pathByPlaceholder: Record<string, string>,
): string {
  let out = prompt;
  for (const [placeholder, abs] of Object.entries(pathByPlaceholder)) {
    out = out.split(placeholder).join(abs);
  }
  return out;
}
