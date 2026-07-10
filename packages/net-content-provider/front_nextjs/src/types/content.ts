export type ItemType = "Folder" | "Text" | "Ref" | string;

export type AddressTuple = {
  repo: string;
  loca: string;
};

export type ContentItem = {
  address: string;
  adrTuple?: [string, string] | { item1?: string; item2?: string; repo?: string; loca?: string };
  type: ItemType;
  name: string;
  body?: unknown;
  indexQnameDict?: Record<string, string>;
};
