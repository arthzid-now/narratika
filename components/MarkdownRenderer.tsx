import React from 'react';

// A very simple display component since we can't bring in react-markdown in this environment easily.
// It preserves whitespace and handles basic wrapping.
export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="whitespace-pre-wrap font-sans text-gray-700 leading-relaxed text-sm">
      {content}
    </div>
  );
};