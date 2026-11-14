// llms.txt (https://llmstxt.org): an index of every docs page so coding agents can find the right one.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const sections = ['start', 'concepts', 'guides', 'migration', 'reference'];

export const GET: APIRoute = async ({ site }) => {
  const docs = await getCollection('docs');
  const body = sections
    .map((s) => {
      const items = docs
        .filter((d) => d.id.startsWith(`${s}/`) && !d.data.sidebar?.hidden)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((d) => `- [${d.data.title}](${new URL(`/${d.id}/`, site)})${d.data.description ? `: ${d.data.description}` : ''}`);
      return `## ${s[0]!.toUpperCase()}${s.slice(1)}\n\n${items.join('\n')}`;
    })
    .join('\n\n');
  const head = `# @ylcnfrht/enhanced-abort-controller\n\n> An AbortController with .NET CancellationTokenSource features for TypeScript and JavaScript: resettable abortAfter (CancelAfter), register() with a disposable handle, whenAborted, linked controllers that remove their listeners, TimeSpan, isAbortError/isTimeoutError. Zero dependencies, ESM + CJS, Node >= 20.\n\nKey rules: \`controller.signal\` IS a real AbortSignal (pass it directly to fetch; never \`signal.signal\`, that was 1.x); \`abortAfter()\` replaces the previous deadline and aborts with a DOMException named TimeoutError; \`dispose()\`/\`using\` releases the timer and parent links but does NOT abort; the abortAfter timer is unref'd, so in Node it never keeps the process alive on its own; classify errors with \`isAbortError(e)\` / \`isTimeoutError(e)\`, not \`instanceof AbortError\`; register callbacks receive the reason.\n\nAPI reference: ${new URL('/api/overview/', site)}\nPlayground: ${new URL('/playground/', site)}\n\n`;
  return new Response(head + body + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
