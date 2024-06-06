import { DocumentDirectoryPath, downloadFile, exists as fileExists, readDir } from '@dr.pogodin/react-native-fs';
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
import Spacer from './Spacer.tsx';

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

const AssetContext = createContext(null);

export const useAssetPath = () => {
  return useContext(AssetContext);
}

export const AssetUpdater = ({ children }) => {
  const [progress, setProgress] = useState(0.0);
  const [progressMessage, setProgressMessage] = useState("");
  const [assetPath, setAssetPath] = useState('');
  const [estimatedTime, setEstimatedTime] = useState("Calculating...");

  const onUpdate = async (): Promise<string> => {
    const { uri } = await DocumentPicker.pickSingle({
      type: "public.zip-archive",
      mode: "open",
      presentationStyle: 'fullScreen'
    });
    return unzipLuti(uri);
  }

  const unzipLuti = async (uri) => {
    const subscription = subscribe(function ({
      progress: zipProgress,
      filePath,
    }) {
      setProgress(zipProgress);
    });
    setProgressMessage("Unpacking LUTI from file");
    setProgress(0.0);

    if (uri !== null) {
      const srcPath = decodeURI(uri.substring(7));
      const targetPath = `${DocumentDirectoryPath}/luti-${Date.now()}`;
      setProgress(0.0);
      const unzipPath = await unzip(srcPath, targetPath);
      if (await fileExists(unzipPath + "/asset-manifest.json")) {
        Settings.set({ admin_mode: 0 });
        subscription.remove();
        return unzipPath;
      }
    }
    subscription.remove();
    setProgressMessage("");
    throw new Error("Didn't find a LUTI website in zip file");
  };
  const full_url = 'https://lifeundertheice.s3.amazonaws.com/luti-2024-01-21T13-20.zip';
  const tiny_url = 'https://lifeundertheice.s3.amazonaws.com/tiny-luti-2024-05-12T11-03.zip';

  const downloadLuti = async (url): Promise<string> => {
    // const url = 'http://localhost:9000/mini-luti-2024-05-11T21-14.zip';
    const destPath = `${DocumentDirectoryPath}/luti-${Date.now()}`;

    setProgressMessage("Downloading LUTI data");
    setProgress(0.0);
    const startTime = Date.now();
    let estimatedTimes = [];
    const options = {
      fromUrl: url,
      toFile: destPath,
      background: false,
      progressDivider: 1,
      progress: (res) => {
        const progressPercent = (res.bytesWritten / res.contentLength);
        console.log(`Progress: ${progressPercent.toFixed(2)}%`);
        // Update your progress state or UI here
        // https://lifeundertheice.s3.amazonaws.com/mini-luti-2024-05-11T21-14.zip
        setProgress(progressPercent);

        // Calculate estimated remaining time
        const elapsedTime = Date.now() - startTime;
        const estimatedTotalTime = elapsedTime / progressPercent;
        const estimatedRemainingTime = estimatedTotalTime - elapsedTime;

        estimatedTimes.push(estimatedRemainingTime);
        const lastEstimates = estimatedTimes.slice(-5);

        if (lastEstimates.length > 0) {
          let averageEstimatedTime = lastEstimates.reduce((sum, time) => sum + time, 0) / lastEstimates.length;

          // Format the average estimated time
          const seconds = Math.floor((averageEstimatedTime / 1000) % 60);
          const minutes = Math.floor((averageEstimatedTime / 1000 / 60) % 60);
          const hours = Math.floor((averageEstimatedTime / 1000 / 60 / 60) % 24);
          setEstimatedTime(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        } else {
          setEstimatedTime("Calculating...");
        }
      },
    };

    console.log("DOWNLOADING", url);
    return downloadFile(options).promise.then(async res => {
      return await unzipLuti("file://" + destPath);
    });
  };

  const getLatestAssetDirectory = async (): Promise<string> => {
    if (Settings.get("admin_mode") !== 0) {
      throw new Error("Admin Mode");
    }
    const lutiDir = (await readDir(DocumentDirectoryPath))

    const last = lutiDir
      .sort((a, b) => a.name.localeCompare(b.name))
      .findLast(d => d.isDirectory() && d.name.startsWith("luti-"));
    if (last !== undefined) {
      return last.path;
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
