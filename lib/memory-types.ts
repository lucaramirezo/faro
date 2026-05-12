export interface BacklinkRef {
  sourcePath: string;
  sourceSlug: string;
  title?: string;
}

export interface MemoryPage {
  slug: string;
  path: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  outboundLinks: string[];
  inboundBacklinks: BacklinkRef[];
}
