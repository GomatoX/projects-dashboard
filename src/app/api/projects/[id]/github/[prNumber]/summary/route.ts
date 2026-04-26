import { NextRequest, NextResponse } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { db } from '@/lib/db';
import { projects, pullRequests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchPRDetail } from '@/lib/github';

// POST /api/projects/[id]/github/[prNumber]/summary — AI summary of a PR
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; prNumber: string }> },
) {
  const { id, prNumber } = await params;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project?.github) {
    return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 });
  }

  try {
    const pr = await fetchPRDetail(project.github, parseInt(prNumber, 10));

    // Truncate diff if too large
    const maxDiffLength = 30_000;
    const diff =
      pr.diff.length > maxDiffLength
        ? pr.diff.slice(0, maxDiffLength) + '\n\n... [diff truncated]'
        : pr.diff;

    const prompt = `Analyze this Pull Request and provide a structured summary.

PR #${pr.number}: ${pr.title}
Author: ${pr.author}
Branch: ${pr.branch} → ${pr.baseBranch}
Files changed: ${pr.changedFiles} (+${pr.additions}/-${pr.deletions})

PR Description:
${pr.body || '(no description)'}

Files changed:
${pr.files.map((f) => `  ${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')}

Diff:
\`\`\`diff
${diff}
\`\`\`

Respond in this JSON format:
{
  "summary": "2-3 sentence overview of what this PR does",
  "changes": ["list of key changes"],
  "risks": ["potential risks or issues to watch for"],
  "suggestions": ["review suggestions"],
  "complexity": "low|medium|high",
  "categories": ["bug-fix", "feature", "refactor", "docs", "test", "chore"]
}`;

    let resultText = '';

    const agentQuery = query({
      prompt,
      options: {
        cwd: project.path,
        model: 'claude-sonnet-4-20250514',
        maxTurns: 1,
        tools: [],
        persistSession: false,
      },
    });

    for await (const message of agentQuery) {
      const msg = message as SDKMessage;
      if (msg.type === 'result') {
        const resultMsg = msg as SDKResultMessage;
        if (resultMsg.subtype === 'success') {
          resultText = resultMsg.result;
        }
      }
    }

    // Try to parse as JSON
    let summary;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = resultText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : resultText;
      summary = JSON.parse(jsonStr);
    } catch {
      summary = {
        summary: resultText,
        changes: [],
        risks: [],
        suggestions: [],
        complexity: 'medium',
        categories: [],
      };
    }

    // Save to DB
    const prId = `${id}-${prNumber}`;
    await db
      .update(pullRequests)
      .set({ aiSummary: JSON.stringify(summary) })
      .where(eq(pullRequests.id, prId));

    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate summary' },
      { status: 500 },
    );
  }
}
