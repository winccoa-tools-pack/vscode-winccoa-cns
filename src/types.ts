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

/** Metadata about the datapoint linked to a CNS node. */
export interface DpDetails {
  /** Datapoint element name (e.g. "Pump01.value"). */
  dpName: string;
  /** WinCC OA datapoint type name (e.g. "ExampleDP_Float"). */
  typeName: string;
  /** Multilingual description (lang-code → string). */
  description: Record<string, string>;
  /** Alias for the DP (unilingual). */
  alias: string;
  /** Display format string (e.g. "%6.2f"), per language. */
  format: Record<string, string>;
  /** Engineering unit, per language. */
  unit: Record<string, string>;
}

/** Extended CNS node information returned by POST /cns/node-details. */
export interface CnsNodeDetails {
  /** Full dot-separated CNS path. */
  path: string;
  /** Multilingual display names (lang-code → string). */
  displayNames: Record<string, string>;
  /** Multilingual display path (lang-code → string). */
  displayPath: Record<string, string>;
  /** CNS path of the parent node (empty for root nodes). */
  parentPath: string;
  /** CNS path of the root/tree node. */
  rootPath: string;
  /** Custom property key-value pairs stored on the node. */
  properties: Record<string, unknown>;
  /** Raw user data stored on the node, hex-encoded (empty string if none). */
  userDataHex: string;
  /** Details about the linked datapoint, or null when no DP is linked. */
  dp: DpDetails | null;
}
