import { createMemo } from "solid-js";
import { marked } from "marked";
// @ts-ignore types may vary by env
import DOMPurify from "dompurify";

type Props = { content: string };

export default function Markdown(p: Props) {
  const html = createMemo(() => {
    try {
      const raw = marked.parse(p.content || "");
      return DOMPurify.sanitize(String(raw));
    } catch {
      return p.content || "";
    }
  });
  return (
    <div class="text-sm leading-relaxed space-y-2 [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded" innerHTML={html()} />
  );
}