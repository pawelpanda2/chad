/**
 * `CpCompatibleDataProvider` backed by direct filesystem reads/writes
 * against the same repo directory tree Content Provider itself owns —
 * bypassing the .NET Content Provider application (`NetFileCpProvider`)
 * entirely, live, for real request traffic (not just the offline migrator,
 * which already does this via `cp-fs-reader.ts`).
 *
 * **Stub only — intentionally left empty for now.** Not registered by
 * `getDataRouter()`/`data-providers/config.ts`; no `DBA_FILE_ENABLED`-style
 * flag exists yet. Every method throws until a real implementation lands.
 *
 * When implemented, reads should reuse `cp-fs-reader.ts`'s
 * `readCpItemFromDisk`/`listChildLocaSegments` (already proven against the
 * real repo tree by the migrator) — writes need their own next-child-index
 * allocation and locking story mirroring `MongoCpProvider`'s
 * `reserveNextChildAddress`, since concurrent writers on a plain
 * filesystem have no equivalent of Mongo's atomic `findOneAndUpdate`.
 */

import type { CpItem } from "../cp-model.js";
import type { DataWriteCommand, DataWriteResult } from "../data-commands.js";
import type {
  CpCompatibleDataProvider,
  GetByNames2Input,
  GetByNamesInput,
  GetItemInput,
} from "./types.js";

export class FileCpProvider implements CpCompatibleDataProvider {
  readonly name = "file" as const;

  async getItem(_input: GetItemInput): Promise<CpItem | null> {
    throw new Error("FileCpProvider.getItem: not implemented yet");
  }

  async getByNames(_input: GetByNamesInput): Promise<CpItem | null> {
    throw new Error("FileCpProvider.getByNames: not implemented yet");
  }

  async getByNames2(_input: GetByNames2Input): Promise<CpItem[]> {
    throw new Error("FileCpProvider.getByNames2: not implemented yet");
  }

  async getChildren(_parentAddress: string): Promise<CpItem[]> {
    throw new Error("FileCpProvider.getChildren: not implemented yet");
  }

  async findRecursively(_rootAddress: string, _phrase: string): Promise<CpItem[]> {
    throw new Error("FileCpProvider.findRecursively: not implemented yet");
  }

  async executeWrite(_command: DataWriteCommand): Promise<DataWriteResult> {
    throw new Error("FileCpProvider.executeWrite: not implemented yet");
  }

  async putItemConfig(_item: CpItem): Promise<CpItem> {
    throw new Error("FileCpProvider.putItemConfig: not implemented yet");
  }
}
