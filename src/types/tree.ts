export interface TreeNode {
  fen: string;
  move?: string;
  children: TreeNode[];
  isPending?: boolean;
  // Lichess study import enhancements
  annotation?: string;
  comment?: string;
  shapes?: Array<{
    from: string;
    to: string;
    color: string;
    brush: string;
  }>;
  // Node information fields
  title?: string; // Limited to 20 characters
  description?: string; // Limited to 100 characters
}
