import { useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('yaml', yaml);

interface YamlBlockProps {
  content: string;
  maxLines?: number;
}

export default function YamlBlock({ content, maxLines }: YamlBlockProps) {
  const codeRef = useRef<HTMLElement>(null);

  const displayContent = maxLines
    ? content.split('\n').slice(0, maxLines).join('\n')
    : content;

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(codeRef.current);
    }
  }, [displayContent]);

  return (
    <pre className="yaml-block">
      <code ref={codeRef} className="language-yaml">
        {displayContent}
      </code>
    </pre>
  );
}
