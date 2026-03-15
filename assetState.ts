export type AssetDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

export type StartupDecision =
  | { kind: 'bootstrap' }
  | { kind: 'admin' }
  | { kind: 'use'; path: string }
  | { kind: 'none' };

type ResolveStartupAssetArgs = {
  adminMode: unknown;
  bootstrapComplete: unknown;
  currentAssetPath: string | null | undefined;
  entries: AssetDirectoryEntry[];
};

const isBootstrapped = (value: unknown) => value === true || value === 1;

const isAdminModeEnabled = (value: unknown) => value === true || value === 1;

export const getLatestAssetPath = (entries: AssetDirectoryEntry[]) => {
  const latest = [...entries]
    .filter(entry => entry.isDirectory && entry.name.startsWith('luti-'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .pop();

  return latest?.path ?? null;
};

export const TEMP_DOWNLOAD_PREFIX = 'luti-download-';

export const isTemporaryDownloadEntry = (entry: AssetDirectoryEntry) => {
  return !entry.isDirectory && entry.name.startsWith(TEMP_DOWNLOAD_PREFIX);
};

export const isTemporaryDownloadPath = (path: string, documentDirectoryPath: string) => {
  return path.startsWith(`${documentDirectoryPath}/${TEMP_DOWNLOAD_PREFIX}`);
};

export const resolveStartupAsset = ({
  adminMode,
  bootstrapComplete,
  currentAssetPath,
  entries,
}: ResolveStartupAssetArgs): StartupDecision => {
  const latestAssetPath = getLatestAssetPath(entries);
  const hasExistingAssets = latestAssetPath !== null;

  if (!isBootstrapped(bootstrapComplete) && !hasExistingAssets) {
    return {kind: 'bootstrap'};
  }

  if (isAdminModeEnabled(adminMode)) {
    return {kind: 'admin'};
  }

  if (currentAssetPath && entries.some(entry => entry.isDirectory && entry.path === currentAssetPath)) {
    return {kind: 'use', path: currentAssetPath};
  }

  if (latestAssetPath) {
    return {kind: 'use', path: latestAssetPath};
  }

  return {kind: 'none'};
};
