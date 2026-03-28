/**
 * Shared types mirroring the MCP server's CnsNodeInfo shape.
 */

export interface CnsNodeInfo {
  path: string;
  /** Display name resolved for the current project language. */
  displayName: string;
  /** All multilingual display names (lang-code → string). */
  displayNames: Record<string, string>;
  /** Linked datapoint name; empty string when no DP is linked. */
  linkedDp: string;
  /** True when this node is a tree root (direct child of a view). */
  isTree: boolean;
  /** True when this node has no children. */
  isLeaf: boolean;
  /** Optional icon path configured in WinCC OA. */
  icon?: string;
}
