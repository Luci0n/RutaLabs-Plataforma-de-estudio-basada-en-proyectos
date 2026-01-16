"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownRenderer(props: { md: string; className?: string }) {
  const md = props.md ?? "";

  return (
    <div
      className={[
        "prose prose-sm max-w-none",
        "dark:prose-invert",
        "prose-p:leading-7 prose-li:leading-7",
        "prose-h1:text-2xl prose-h1:font-semibold prose-h1:mt-6 prose-h1:mb-3",
        "prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-5 prose-h2:mb-2",
        "prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2",
        "prose-a:text-blue-600 prose-a:underline prose-a:underline-offset-4",
        "dark:prose-a:text-blue-400",
        "prose-ul:list-disc prose-ol:list-decimal prose-ul:pl-6 prose-ol:pl-6",
        "prose-blockquote:border-l prose-blockquote:border-muted prose-blockquote:pl-4 prose-blockquote:text-muted-foreground",
        "prose-code:break-words prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-muted",
        "prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-3 prose-pre:overflow-auto",
        "prose-table:w-full prose-th:border prose-td:border prose-th:px-2 prose-td:px-2 prose-th:py-1 prose-td:py-1",
        props.className ?? "",
      ].join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}
