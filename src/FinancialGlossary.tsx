import { FINANCIAL_GLOSSARY } from "./glossary";

export function FinancialGlossary() {
  return <details className="miniPanel financialGlossary">
    <summary>Financial terms explained</summary>
    <dl>{Object.entries(FINANCIAL_GLOSSARY).map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}</dl>
  </details>;
}
