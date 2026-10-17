import type { FuseConfig } from "@electron/fuses";

/** What the hook reads from electron-builder's afterPack context. */
export interface AfterPackContext {
  readonly appOutDir: string;
  readonly electronPlatformName: string;
  readonly packager: { readonly appInfo: { readonly productFilename: string } };
}

export declare const APP_FUSES: FuseConfig;

export default function afterPack(context: AfterPackContext): Promise<void>;
