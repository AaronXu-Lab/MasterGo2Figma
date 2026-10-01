import { normalizeLayoutGrids } from "../../shared/layoutGridUtils";

// MasterGo lazily resolves layoutGrids for the selected node. Even immediately
// after selection the getter can return []; resolution needs one UI turn.
export async function readResolvedLayoutGrids(node: any, page: any, document: any): Promise<any[]> {
  const direct = normalizeLayoutGrids(node.layoutGrids);
  if (direct.length) return direct;
  const previousPage = document.currentPage;
  const previousSelection = page.selection;
  try {
    if (previousPage !== page) document.currentPage = page;
    page.selection = [node];
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    return normalizeLayoutGrids(node.layoutGrids);
  } finally {
    try {
      page.selection = previousSelection.filter((item: any) => !item.removed);
    } finally {
      if (document.currentPage !== previousPage) document.currentPage = previousPage;
    }
  }
}
