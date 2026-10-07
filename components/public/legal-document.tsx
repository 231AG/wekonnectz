/**
 * Renders a published legal document body: "## " lines are headings, "- " lines are list items,
 * blank lines separate paragraphs. Plain text only — no HTML from the database is ever rendered.
 */
function LegalDocumentBody({ body }: { body: string }) {
  const blocks = body.split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        return lines.map((line, j) => {
          const key = `${i}-${j}`;
          if (line.startsWith("## ")) return <h2 key={key}>{line.slice(3)}</h2>;
          if (line.startsWith("- ")) return <li key={key}>{line.slice(2)}</li>;
          return <p key={key}>{line}</p>;
        });
      })}
    </>
  );
}

export { LegalDocumentBody };
