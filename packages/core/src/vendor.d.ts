/**
 * Ambient module declaration for @polymarket/builder-signing-sdk.
 * This is a transitive dependency of @polymarket/clob-client and may not
 * ship its own type declarations to direct consumers.
 */
declare module '@polymarket/builder-signing-sdk' {
  export class BuilderConfig {
    constructor(config?: {
      remoteBuilderConfig?: { url: string; token?: string };
      localBuilderCreds?: { key: string; secret: string; passphrase: string };
    });
    isValid(): boolean;
    getBuilderType(): string;
    generateBuilderHeaders(
      method: string,
      path: string,
      body?: string,
      timestamp?: number,
    ): Promise<Record<string, string> | undefined>;
  }
}
