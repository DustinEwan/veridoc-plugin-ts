// The document-tree index builder. `index.doc.ts` calls `tree({concepts, documents})` and
// the plugin reports the fragment from `collect`; `tree.doc` declares one document node.

import { registerIndex, type DocumentDecl } from "@veridoc/claims";

export interface DocInput {
  path: string;
  audience: string;
  question: string;
  notApplicable?: string;
}

export interface TreeIndex {
  concepts: string[];
  documents: DocumentDecl[];
}

export function tree(def: { concepts: string[]; documents: DocumentDecl[] }): TreeIndex {
  registerIndex(def.concepts, def.documents);
  return { concepts: def.concepts, documents: def.documents };
}

export namespace tree {
  export function doc(input: DocInput): DocumentDecl {
    return { ...input };
  }
}

export type { DocumentDecl };
