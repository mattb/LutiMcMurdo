import {describe, expect, it} from '@jest/globals';

import {
  isTemporaryDownloadEntry,
  isTemporaryDownloadPath,
  resolveStartupAsset,
  TEMP_DOWNLOAD_PREFIX,
  type AssetDirectoryEntry,
} from '../assetState';

const entry = (name: string): AssetDirectoryEntry => ({
  name,
  path: `/Documents/${name}`,
  isDirectory: true,
});

const fileEntry = (name: string): AssetDirectoryEntry => ({
  name,
  path: `/Documents/${name}`,
  isDirectory: false,
});

describe('resolveStartupAsset', () => {
  it('boots the bundled tiny dataset before bootstrap is complete', () => {
    expect(
      resolveStartupAsset({
        bootstrapComplete: false,
        adminMode: true,
        currentAssetPath: null,
        entries: [],
      }),
    ).toEqual({kind: 'bootstrap'});
  });

  it('shows admin mode only after bootstrap is complete', () => {
    expect(
      resolveStartupAsset({
        bootstrapComplete: true,
        adminMode: true,
        currentAssetPath: null,
        entries: [entry('luti-100')],
      }),
    ).toEqual({kind: 'admin'});
  });

  it('uses the persisted current asset when it still exists', () => {
    expect(
      resolveStartupAsset({
        bootstrapComplete: true,
        adminMode: false,
        currentAssetPath: '/Documents/luti-100',
        entries: [entry('luti-100'), entry('luti-200')],
      }),
    ).toEqual({kind: 'use', path: '/Documents/luti-100'});
  });

  it('falls back to the newest dataset when the persisted path is missing', () => {
    expect(
      resolveStartupAsset({
        bootstrapComplete: true,
        adminMode: false,
        currentAssetPath: '/Documents/luti-100',
        entries: [entry('luti-200'), entry('luti-300')],
      }),
    ).toEqual({kind: 'use', path: '/Documents/luti-300'});
  });

  it('returns none when there is no asset to use', () => {
    expect(
      resolveStartupAsset({
        bootstrapComplete: true,
        adminMode: false,
        currentAssetPath: null,
        entries: [],
      }),
    ).toEqual({kind: 'none'});
  });

  it('treats existing installs without bootstrap_complete as migrated, not first run', () => {
    expect(
      resolveStartupAsset({
        bootstrapComplete: undefined,
        adminMode: false,
        currentAssetPath: '/Documents/luti-100',
        entries: [entry('luti-100'), entry('luti-200')],
      }),
    ).toEqual({kind: 'use', path: '/Documents/luti-100'});
  });
});

describe('temporary download ownership', () => {
  it('recognizes only app-owned temp download entries for cleanup', () => {
    expect(isTemporaryDownloadEntry(fileEntry(`${TEMP_DOWNLOAD_PREFIX}123.zip`))).toBe(true);
    expect(isTemporaryDownloadEntry(fileEntry('luti-2024-06-19T20-47.zip'))).toBe(false);
    expect(isTemporaryDownloadEntry(entry(`${TEMP_DOWNLOAD_PREFIX}123`))).toBe(false);
  });

  it('only treats app-owned temp download paths as safe to unlink after import', () => {
    expect(
      isTemporaryDownloadPath(`/Documents/${TEMP_DOWNLOAD_PREFIX}123.zip`, '/Documents'),
    ).toBe(true);
    expect(
      isTemporaryDownloadPath('/Documents/luti-2024-06-19T20-47.zip', '/Documents'),
    ).toBe(false);
    expect(
      isTemporaryDownloadPath('/Elsewhere/luti-download-123.zip', '/Documents'),
    ).toBe(false);
  });
});
