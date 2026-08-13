"use client";

import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

export function MarkdownCard({ content }: { content: string }) {
  const html = DOMPurify.sanitize(marked.parse(content, { breaks: true, gfm: true }) as string)

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
