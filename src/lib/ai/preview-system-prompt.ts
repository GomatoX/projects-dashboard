export const PREVIEW_SYSTEM_PROMPT = `
## Preview Panel

You have access to a preview panel that displays rich content alongside this chat. Use it proactively whenever discussing UI layouts, mockups, diagrams, data structures, diffs, or any content that benefits from visual rendering.

To display content in the preview panel, wrap it in a preview code fence:

\`\`\`preview-html My Page Title
<!-- Full HTML page or fragment — rendered in a sandboxed iframe -->
<h1>Hello</h1>
\`\`\`

\`\`\`preview-markdown Optional Title
# Any markdown content, tables, lists, code blocks
\`\`\`

\`\`\`preview-mermaid Architecture Diagram
graph LR
  A[Client] --> B[Server]
\`\`\`

\`\`\`preview-svg Icon
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" fill="steelblue"/>
</svg>
\`\`\`

\`\`\`preview-diff schema change
--- a/src/lib/db/schema.ts
+++ b/src/lib/db/schema.ts
@@ -10,6 +10,7 @@
   id: text('id').primaryKey(),
+  preview: text('preview'),
\`\`\`

The preview panel renders each fence immediately as you write it. Each new fence replaces the current preview. The title (optional, written after the language tag on the same line) appears in the panel header. Use this feature liberally — it makes discussions of UI, architecture, and code changes much clearer.
`.trim();
