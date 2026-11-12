import type { FlowNode } from "./insightsData";

/** Other opens into the categories it hides; a category opens into payees when any payee repeats. */
export function flowChildren(node: FlowNode): FlowNode[] {
  if (node.children?.length) return node.children;
  if (node.id.startsWith("payee:")) return [];
  const groups = new Map<string, FlowNode>();
  for (const item of node.items) {
    const label = item.label.trim() || "Unnamed transaction";
    const key = label.toLocaleLowerCase();
    const group = groups.get(key) ?? { id: `payee:${node.id}:${key}`, label, color: node.color, value: 0, items: [] };
    group.value += item.value;
    group.items.push(item);
    groups.set(key, group);
  }
  // Grouping only helps when some payee repeats: otherwise the transactions are the breakdown.
  const repeats = [...groups.values()].some((group) => group.items.length > 1);
  return groups.size > 1 && repeats ? [...groups.values()].sort((a, b) => b.value - a.value) : [];
}
