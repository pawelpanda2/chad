/**
 * Central primary/follower router (Story 72 §11). Every `dba` business
 * function that needs to read/write a CP-compatible item goes through one
 * `DbaDataRouter` instance instead of hand-rolling
 * `if (mongoEnabled) ... if (contentProviderEnabled) ...` itself (§3/§34).
 */

import type { DbaDataProvidersConfig } from "./data-providers/config.js";
import { resolveFollowerBackendName } from "./data-providers/config.js";
import type {
  CpCompatibleDataProvider,
  DataBackendName,
  GetByNames2Input,
  GetByNamesInput,
  GetItemInput,
} from "./data-providers/types.js";
import type { DataWriteCommand, DataWriteResult } from "./data-commands.js";
import { enqueueFollowerOperation } from "./data-outbox.js";
import { recordShadowReadMismatch } from "./data-sync-diagnostics.js";
import type { CpItem } from "./cp-model.js";

export interface DbaDataRouterDeps {
  config: DbaDataProvidersConfig;
  providers: Partial<Record<DataBackendName, CpCompatibleDataProvider>>;
  /**
   * Logs a follower-enqueue failure without ever throwing — a follower
   * problem must never turn a successful primary write into a failed
   * response (§11). Defaults to `console.error`.
   */
  onFollowerEnqueueError?: (error: unknown, command: DataWriteCommand) => void;
}

export class DbaDataRouter {
  private readonly config: DbaDataProvidersConfig;
  private readonly providers: Partial<Record<DataBackendName, CpCompatibleDataProvider>>;
  private readonly onFollowerEnqueueError: (error: unknown, command: DataWriteCommand) => void;

  constructor(deps: DbaDataRouterDeps) {
    this.config = deps.config;
    this.providers = deps.providers;
    this.onFollowerEnqueueError =
      deps.onFollowerEnqueueError ??
      ((error, command) =>
        console.error(
          `[DbaDataRouter] Failed to enqueue follower operation ${command.operationId}:`,
          error
        ));
  }

  private resolvePrimaryProvider(): CpCompatibleDataProvider {
    const provider = this.providers[this.config.primaryBackend];
    if (!provider) {
      throw new Error(
        `DbaDataRouter: no provider registered for configured primary backend "${this.config.primaryBackend}"`
      );
    }
    return provider;
  }

  private resolveFollowerProvider(): CpCompatibleDataProvider | null {
    const followerName = resolveFollowerBackendName(this.config);
    if (!followerName) return null;
    return this.providers[followerName] ?? null;
  }

  private shouldWriteToFollower(): boolean {
    return this.config.followerWritesEnabled && this.resolveFollowerProvider() !== null;
  }

  /**
   * Executes `command` on the primary synchronously; the request only
   * succeeds if the primary succeeds. If a follower is configured and
   * follower writes are enabled, enqueues (never directly executes) the
   * same command for the follower via the durable outbox (§11/§12).
   */
  async executeWrite(command: DataWriteCommand): Promise<DataWriteResult> {
    const primary = this.resolvePrimaryProvider();
    const primaryResult = await primary.executeWrite(command);

    if (this.shouldWriteToFollower()) {
      const follower = this.resolveFollowerProvider()!;
      // Replay the command with the primary's now-decided item, so the
      // follower never re-runs its own address/id allocation (§8/§23).
      const commandForFollower = withDecidedItem(command, primaryResult.item);
      try {
        await enqueueFollowerOperation({
          command: commandForFollower,
          primaryBackend: primary.name,
          followerBackend: follower.name,
        });
      } catch (error) {
        this.onFollowerEnqueueError(error, commandForFollower);
      }
    }

    return primaryResult;
  }

  async getItem(input: GetItemInput): Promise<CpItem | null> {
    const primary = this.resolvePrimaryProvider();
    const result = await primary.getItem(input);
    this.maybeShadowRead("getItem", () => this.resolveFollowerProvider()?.getItem(input), result);
    return result;
  }

  async getByNames(input: GetByNamesInput): Promise<CpItem | null> {
    const primary = this.resolvePrimaryProvider();
    const result = await primary.getByNames(input);
    this.maybeShadowRead("getByNames", () => this.resolveFollowerProvider()?.getByNames(input), result);
    return result;
  }

  async getByNames2(input: GetByNames2Input): Promise<CpItem[]> {
    const primary = this.resolvePrimaryProvider();
    const result = await primary.getByNames2(input);
    this.maybeShadowRead(
      "getByNames2",
      () => this.resolveFollowerProvider()?.getByNames2(input),
      result.length > 0 ? result[result.length - 1] : null
    );
    return result;
  }

  /**
   * Fire-and-forget comparison against the follower (§16) — never awaited
   * by the caller, never allowed to change the response, never throws
   * into the caller's context.
   */
  private maybeShadowRead(
    operation: string,
    fetchFollower: () => Promise<CpItem | null> | undefined,
    primaryItem: CpItem | null
  ): void {
    if (!this.config.shadowReadsEnabled) return;
    const follower = this.resolveFollowerProvider();
    if (!follower) return;

    Promise.resolve(fetchFollower())
      .then((followerItem) => recordShadowReadMismatch(operation, primaryItem, followerItem ?? null))
      .catch((error) => {
        console.error(`[DbaDataRouter] Shadow read failed for ${operation}:`, error);
      });
  }
}

function withDecidedItem(command: DataWriteCommand, item: CpItem): DataWriteCommand {
  if (command.kind === "put-item") {
    return { ...command, item };
  }
  return { ...command, item };
}
