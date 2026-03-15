import { MainBundlePath, DocumentDirectoryPath, downloadFile, exists as fileExists, readDir, unlink } from '@dr.pogodin/react-native-fs';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import {
  Pressable,
  Settings,
  StyleSheet,
  Text,
  View
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import * as Progress from 'react-native-progress';
import { subscribe, unzip } from 'react-native-zip-archive';
import Spacer from './Spacer';
import {
  isTemporaryDownloadEntry,
  isTemporaryDownloadPath,
  resolveStartupAsset,
  TEMP_DOWNLOAD_PREFIX,
  type AssetDirectoryEntry,
} from './assetState';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredView: {
    padding: 20,
  },
  buttonStyle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 4,
    elevation: 3,
    backgroundColor: 'black',
  },
  disabledButtonStyle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 4,
    elevation: 3,
    backgroundColor: 'gray',
  },
  progressTitle: {
    fontSize: 18,
    color: 'black',
  },
  buttonTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
});

type AssetPath = string | null;

type DownloadProgress = {
  bytesWritten: number;
  contentLength: number;
};

const AssetContext = createContext<AssetPath>(null);
const BOOTSTRAP_COMPLETE_KEY = 'bootstrap_complete';
const CURRENT_ASSET_PATH_KEY = 'current_asset_path';
const ONE_MB = 1024 * 1024;
const ETA_SMOOTHING_FACTOR = 0.2;
const MIN_BYTES_FOR_ETA = 2 * ONE_MB;
const MIN_ELAPSED_MS_FOR_ETA = 1500;
const UI_UPDATE_INTERVAL_MS = 1500;
const DOWNLOAD_SIZES: Record<string, number> = {
  'https://lifeundertheice.s3.amazonaws.com/luti-2024-06-19T20-47.zip': 3.4 * 1024 * 1024 * 1024,
  'https://lifeundertheice.s3.amazonaws.com/tiny-luti-2024-05-12T11-03.zip': 20 * 1024 * 1024,
};

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const formatMegabytes = (bytes: number) => {
  return `${(bytes / ONE_MB).toFixed(1)} MB`;
};

const formatTransferRate = (bytesPerSecond: number) => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return null;
  }

  if (bytesPerSecond >= ONE_MB) {
    return `${(bytesPerSecond / ONE_MB).toFixed(1)} MB/s`;
  }

  return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
};

const getExpectedDownloadSize = async (url: string) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const parsed = Number(contentLength);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {
    // Fall back to bundled size hints if the HEAD request fails.
  }

  return DOWNLOAD_SIZES[url] ?? null;
};

export const useAssetPath = () => {
  return useContext(AssetContext);
}

export const AssetUpdater = ({ children }: { children: ReactNode }) => {
  const [progress, setProgress] = useState(0.0);
  const [progressMessage, setProgressMessage] = useState("");
  const [assetPath, setAssetPath] = useState('');
  const [estimatedTime, setEstimatedTime] = useState("Calculating...");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalDownloadBytes, setTotalDownloadBytes] = useState<number | null>(null);
  const [downloadRate, setDownloadRate] = useState<string | null>(null);

  const onUpdate = async (): Promise<string> => {
    const { uri } = await DocumentPicker.pickSingle({
      type: "public.zip-archive",
      mode: "open",
      presentationStyle: 'fullScreen'
    });
    return unzipLuti(uri);
  }

  const persistSelectedAsset = (path: string) => {
    Settings.set({
      admin_mode: 0,
      [BOOTSTRAP_COMPLETE_KEY]: true,
      [CURRENT_ASSET_PATH_KEY]: path,
    });
  };

  const readAssetEntries = async (): Promise<AssetDirectoryEntry[]> => {
    const entries = await readDir(DocumentDirectoryPath);
    return entries.map(entry => ({
      isDirectory: entry.isDirectory(),
      name: entry.name,
      path: entry.path,
    }));
  };

  const cleanupDownloadedArchives = async (entries: AssetDirectoryEntry[]) => {
    for (const entry of entries) {
      if (!isTemporaryDownloadEntry(entry)) {
        continue;
      }
      await unlink(entry.path).catch(() => {
        // Ignore cleanup failures; the app can continue with the selected asset.
      });
    }
  };

  const unzipLuti = async (uri: string) => {
    const subscription = subscribe(function ({
      progress: zipProgress,
      filePath,
    }) {
      setProgress(zipProgress);
    });
    setProgressMessage("Unpacking LUTI from file");
    setProgress(0.0);
    setDownloadedBytes(0);
    setTotalDownloadBytes(null);
    setDownloadRate(null);

    if (uri !== null) {
      const srcPath = decodeURI(uri.substring(7));
      const targetPath = `${DocumentDirectoryPath}/luti-${Date.now()}`;
      setProgress(0.0);
      const unzipPath = await unzip(srcPath, targetPath);
      if (await fileExists(unzipPath + "/asset-manifest.json")) {
        persistSelectedAsset(unzipPath);
        if (isTemporaryDownloadPath(srcPath, DocumentDirectoryPath)) {
          await unlink(srcPath).catch(() => {
            // Ignore cleanup failures; a stale download artifact is not fatal.
          });
        }
        subscription.remove();
        return unzipPath;
      }
    }
    subscription.remove();
    setProgressMessage("");
    throw new Error("Didn't find a LUTI website in zip file");
  };
  const full_url = 'https://lifeundertheice.s3.amazonaws.com/luti-2024-06-19T20-47.zip';
  const tiny_url = 'https://lifeundertheice.s3.amazonaws.com/tiny-luti-2024-05-12T11-03.zip';

  const downloadLuti = async (url: string): Promise<string> => {
    // const url = 'http://localhost:9000/mini-luti-2024-05-11T21-14.zip';
    const destPath = `${DocumentDirectoryPath}/${TEMP_DOWNLOAD_PREFIX}${Date.now()}.zip`;

    setProgressMessage("Downloading LUTI data");
    setProgress(0.0);
    setEstimatedTime("Calculating...");
    setDownloadedBytes(0);
    setDownloadRate(null);
    const expectedSize = await getExpectedDownloadSize(url);
    setTotalDownloadBytes(expectedSize);
    const startTime = Date.now();
    let lastReportedMegabyte = -1;
    let lastBytesWritten = 0;
    let lastSampleTime = startTime;
    let lastUiUpdateTime = 0;
    let smoothedBytesPerSecond = 0;
    const options = {
      fromUrl: url,
      toFile: destPath,
      background: false,
      progressDivider: 0,
      progress: (res: DownloadProgress) => {
        const totalBytes = expectedSize ?? res.contentLength;
        const downloadedMegabyte = Math.floor(res.bytesWritten / ONE_MB);

        if (downloadedMegabyte === lastReportedMegabyte && res.bytesWritten < totalBytes) {
          return;
        }
        lastReportedMegabyte = downloadedMegabyte;

        const progressPercent = (res.bytesWritten / totalBytes);
        console.log(`Progress: ${progressPercent.toFixed(2)}%`);

        // Calculate estimated remaining time
        const now = Date.now();
        const elapsedTime = now - startTime;
        const bytesDelta = res.bytesWritten - lastBytesWritten;
        const timeDeltaMs = now - lastSampleTime;

        if (timeDeltaMs > 0 && bytesDelta >= 0) {
          const instantaneousBytesPerSecond = (bytesDelta / timeDeltaMs) * 1000;
          smoothedBytesPerSecond = smoothedBytesPerSecond === 0
            ? instantaneousBytesPerSecond
            : (smoothedBytesPerSecond * (1 - ETA_SMOOTHING_FACTOR))
              + (instantaneousBytesPerSecond * ETA_SMOOTHING_FACTOR);
        }

        lastBytesWritten = res.bytesWritten;
        lastSampleTime = now;

        const shouldShowEta =
          res.bytesWritten >= totalBytes ||
          (
            res.bytesWritten >= MIN_BYTES_FOR_ETA &&
            elapsedTime >= MIN_ELAPSED_MS_FOR_ETA &&
            smoothedBytesPerSecond > 0
          );
        const nextEstimatedTime = shouldShowEta
          ? formatDuration((Math.max(0, totalBytes - res.bytesWritten) / smoothedBytesPerSecond) * 1000)
          : "Calculating...";
        const nextDownloadRate = formatTransferRate(smoothedBytesPerSecond);
        const shouldFlushUi = res.bytesWritten >= totalBytes
          || lastUiUpdateTime === 0
          || now - lastUiUpdateTime >= UI_UPDATE_INTERVAL_MS;

        if (!shouldFlushUi) {
          return;
        }

        lastUiUpdateTime = now;
        setDownloadedBytes(res.bytesWritten);
        setTotalDownloadBytes(totalBytes);
        setProgress(progressPercent);
        setDownloadRate(nextDownloadRate);

        if (
          shouldShowEta
        ) {
          setEstimatedTime(nextEstimatedTime);
        } else {
          setEstimatedTime("Calculating...");
        }
      },
    };

    console.log("DOWNLOADING", url);
    return downloadFile(options).promise.then(async res => {
      setDownloadedBytes(expectedSize ?? res.bytesWritten);
      setTotalDownloadBytes(expectedSize ?? res.bytesWritten);
      return await unzipLuti("file://" + destPath);
    });
  };

  const getLatestAssetDirectory = async (): Promise<string> => {
    const entries = await readAssetEntries();
    await cleanupDownloadedArchives(entries);

    const decision = resolveStartupAsset({
      adminMode: Settings.get("admin_mode"),
      bootstrapComplete: Settings.get(BOOTSTRAP_COMPLETE_KEY),
      currentAssetPath: Settings.get(CURRENT_ASSET_PATH_KEY) as string | null | undefined,
      entries,
    });

    if (decision.kind === 'bootstrap') {
      const localZip = `file://${MainBundlePath}/tiny-luti-2024-05-12T11-03.zip`;
      console.log("Unzipping", localZip);
      return await unzipLuti(localZip);
    }

    if (decision.kind === 'admin') {
      throw new Error("Admin Mode");
    }

    if (decision.kind === 'use') {
      persistSelectedAsset(decision.path);
      return decision.path;
    }

    throw new Error("No LUTI dirs available");
  };

  useEffect(() => {
    const getLatest = async () => {
      try {
        let path = await getLatestAssetDirectory();
        setAssetPath(path);
      } catch (err) {
        console.log(err);
        //pass
      }
    };
    getLatest()
      .catch(console.error);
  }, []);

  if (assetPath === '') {
    return <View style={styles.container}>
      <View style={styles.centeredView}>
        <Text style={styles.progressTitle}>Life Under The Ice needs a dataset to run.</Text>
        <Text style={styles.progressTitle}>You can either download a test dataset or insert a USB disk containing a LUTI zip file.</Text>
        <Spacer size={50} vertical />
        <Pressable
          disabled={progress > 0.0}
          onPress={async () => {
            setAssetPath(await onUpdate())
          }}
          style={progress > 0.0 ? styles.disabledButtonStyle : styles.buttonStyle}>
          <Text style={styles.buttonTitle}>Update from zip file</Text>
        </Pressable>
        <Spacer size={50} vertical />
        <Pressable
          disabled={progress > 0.0}
          onPress={async () => {
            setAssetPath(await downloadLuti(tiny_url))
          }}
          style={progress > 0.0 ? styles.disabledButtonStyle : styles.buttonStyle}>
          <Text style={styles.buttonTitle}>Download test version (20Mb)</Text>
        </Pressable>
        <Spacer size={50} vertical />
        <Pressable
          disabled={progress > 0.0}
          onPress={async () => {
            setAssetPath(await downloadLuti(full_url))
          }}
          style={progress > 0.0 ? styles.disabledButtonStyle : styles.buttonStyle}>
          <Text style={styles.buttonTitle}>Download full version (3.4Gb)</Text>
        </Pressable>
        <Spacer size={50} vertical />
        {progressMessage !== "" ? (
          <>
            <Progress.Bar progress={progress} width={200} />
            {progressMessage === "Downloading LUTI data" ? (
              <>
                <Spacer size={10} vertical />
                <Text style={styles.progressTitle}>
                  {totalDownloadBytes !== null
                    ? `${formatMegabytes(downloadedBytes)} / ${formatMegabytes(totalDownloadBytes)}`
                    : formatMegabytes(downloadedBytes)}
                </Text>
                {downloadRate ? (
                  <Text style={styles.progressTitle}>{downloadRate}</Text>
                ) : null}
              </>
            ) : null}
            <Spacer size={10} vertical />
            <Text style={styles.progressTitle}>Estimated time remaining: {estimatedTime}</Text>
          </>
        ) : null}
      </View>
    </View>;
  } else {
    return <AssetContext.Provider value={assetPath}>
      {children}
    </AssetContext.Provider>
  }
}
