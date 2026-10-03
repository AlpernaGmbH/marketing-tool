/** HTML aus markdownToHtml (nur Inhalte aus dem Repo) im ruhigen Fliesstext-Stil. */
export function Html({ html, className }: { html: string; className?: string }) {
  return <div className={className ? `content ${className}` : "content"} dangerouslySetInnerHTML={{ __html: html }} />;
}
