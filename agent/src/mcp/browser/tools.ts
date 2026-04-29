// agent/src/mcp/browser/tools.ts
import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { getOrCreateContext, touch } from './context-pool.js';

interface ToolDeps {
  chatId: string;
  sessionId: string;
}

/**
 * Build the eight Browser MCP tools, all closed over the chatId so the
 * model can never reach a different chat's context.
 */
export function buildBrowserTools(deps: ToolDeps) {
  const { chatId, sessionId } = deps;

  const getPage = async () => {
    const pooled = await getOrCreateContext(chatId, sessionId);
    return pooled.page;
  };

  const ok = (text: string) => ({
    content: [{ type: 'text' as const, text }],
    isError: false,
  });
  const err = (text: string) => ({
    content: [{ type: 'text' as const, text }],
    isError: true,
  });

  return [
    tool(
      'browser_navigate',
      'Navigate the browser to a URL. Waits for DOMContentLoaded.',
      {
        url: z.string().url().describe('Absolute URL to navigate to.'),
        waitUntil: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .default('domcontentloaded')
          .describe('Playwright wait condition.'),
      },
      async ({ url, waitUntil }) => {
        try {
          const page = await getPage();
          const resp = await page.goto(url, { waitUntil, timeout: 30_000 });
          touch(chatId);
          const status = resp?.status() ?? 'unknown';
          return ok(`Navigated to ${page.url()} (status: ${status})`);
        } catch (e) {
          return err(`Navigate failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_click',
      'Click an element by CSS selector or by accessible role+name. Prefer role+name when possible. Supported role syntax: "role=TYPE" or "role=TYPE[name=\\"...\\"]" with double-quoted name (exact match). For other Playwright role options (level, pressed, checked, expanded, …), use a CSS selector instead.',
      {
        selector: z.string().describe('CSS selector or "role=button[name=\\"Submit\\"]" syntax.'),
      },
      async ({ selector }) => {
        try {
          const page = await getPage();
          const locator = selector.startsWith('role=')
            ? page.getByRole(...parseRoleSelector(selector))
            : page.locator(selector);
          await locator.first().click({ timeout: 10_000 });
          touch(chatId);
          return ok(`Clicked: ${selector}`);
        } catch (e) {
          return err(`Click failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_type',
      'Type text into the currently focused element (or a selector if provided). Adds keystrokes one at a time so it triggers React-style onChange.',
      {
        text: z.string().describe('Text to type.'),
        selector: z
          .string()
          .optional()
          .describe('Optional CSS selector to focus before typing.'),
      },
      async ({ text, selector }) => {
        try {
          const page = await getPage();
          if (selector) {
            await page.locator(selector).first().focus({ timeout: 5_000 });
          }
          await page.keyboard.type(text);
          touch(chatId);
          return ok(`Typed ${text.length} chars`);
        } catch (e) {
          return err(`Type failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_fill',
      'Set the value of a form field directly (faster than typing for long values).',
      {
        selector: z.string().describe('CSS selector of an <input>/<textarea>/contenteditable.'),
        value: z.string().describe('New value.'),
      },
      async ({ selector, value }) => {
        try {
          const page = await getPage();
          await page.locator(selector).first().fill(value, { timeout: 10_000 });
          touch(chatId);
          return ok(`Filled ${selector}`);
        } catch (e) {
          return err(`Fill failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_press_key',
      'Press a single key (e.g. "Enter", "Escape", "Tab", "Shift+Enter").',
      {
        key: z.string().describe('Key name. Combine modifiers with "+", e.g. "Control+a".'),
      },
      async ({ key }) => {
        try {
          const page = await getPage();
          await page.keyboard.press(key);
          touch(chatId);
          return ok(`Pressed ${key}`);
        } catch (e) {
          return err(`Key press failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_snapshot',
      'Capture an accessibility-tree snapshot + a JPEG screenshot of the current page. Use this between actions instead of guessing the DOM.',
      {},
      async () => {
        try {
          const page = await getPage();
          // page.accessibility.snapshot() was removed in Playwright 1.x.
          // The modern replacement is page.locator('body').ariaSnapshot() which
          // returns a YAML string directly (no JSON.stringify needed).
          const rawSnap = await page.locator('body').ariaSnapshot();
          const snap = rawSnap.trim() || '(empty — page may have no <body>, e.g. about:blank or chrome:// URLs)';
          const screenshot = await page.screenshot({
            type: 'jpeg',
            quality: 60,
            fullPage: false,
          });
          touch(chatId);
          return {
            content: [
              {
                type: 'text' as const,
                text: `URL: ${page.url()}\nTitle: ${await page.title()}\n\nAccessibility tree:\n${snap}`,
              },
              {
                type: 'image' as const,
                data: screenshot.toString('base64'),
                mimeType: 'image/jpeg',
              },
            ],
            isError: false,
          };
        } catch (e) {
          return err(`Snapshot failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_evaluate',
      'Run a JavaScript expression in the BROWSER PAGE context (not Node.js) and return its JSON-serializable result. Use sparingly — prefer click/fill/snapshot.',
      {
        expression: z
          .string()
          .describe(
            'A JS expression. Wrap in parens if it\'s an object literal, e.g. "(window.location.href)".',
          ),
      },
      async ({ expression }) => {
        try {
          const page = await getPage();
          const result = await page.evaluate(expression);
          touch(chatId);
          return ok(`Result: ${JSON.stringify(result)}`);
        } catch (e) {
          return err(`Evaluate failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),

    tool(
      'browser_wait_for',
      'Wait for a selector to appear / disappear / become visible.',
      {
        selector: z.string().describe('CSS selector.'),
        state: z
          .enum(['attached', 'detached', 'visible', 'hidden'])
          .default('visible'),
        timeoutMs: z.number().int().min(100).max(60_000).default(10_000),
      },
      async ({ selector, state, timeoutMs }) => {
        try {
          const page = await getPage();
          await page.waitForSelector(selector, { state, timeout: timeoutMs });
          touch(chatId);
          return ok(`Selector ${selector} reached state=${state}`);
        } catch (e) {
          return err(`Wait failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    ),
  ];
}

/**
 * Parse "role=button[name=\"Submit\"]" into Playwright getByRole args.
 * Throws on malformed input.
 */
function parseRoleSelector(
  s: string,
): [Parameters<import('playwright').Page['getByRole']>[0], { name?: string }] {
  // role=button or role=button[name="Submit"]
  const match = s.match(/^role=([a-z]+)(?:\[name="([^"]*)"\])?$/);
  if (!match) {
    throw new Error(`Bad role selector: ${s} (expected role=button[name="Foo"])`);
  }
  const [, role, name] = match;
  return [
    role as Parameters<import('playwright').Page['getByRole']>[0],
    name ? { name } : {},
  ];
}
