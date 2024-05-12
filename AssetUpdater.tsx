import { useEffect, useState, useContext, createContext } from 'react'
import * as Progress from 'react-native-progress';
import DocumentPicker from 'react-native-document-picker'
import { exists as fileExists, readDir, DocumentDirectoryPath, downloadFile } from '@dr.pogodin/react-native-fs';
import { subscribe, unzip } from 'react-native-zip-archive'
import {
    StyleSheet,
    View,
    Text,
    Settings,
    Pressable,
    Button,
} from 'react-native';
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

    const downloadLuti = async (): Promise<string> => {
      const url = 'https://lifeundertheice.s3.amazonaws.com/mini-luti-2024-05-11T21-14.zip';
      // const url = 'http://localhost:9000/mini-luti-2024-05-11T21-14.zip';
      const destPath = `${DocumentDirectoryPath}/luti-${Date.now()}`;

      setProgressMessage("Downloading LUTI data");
      setProgress(0.0);
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
        },
      };

      print("DOWNLOADING", url);
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
                onPress={async () => {
                    setAssetPath(await onUpdate())
                }} 
                style={styles.buttonStyle}>
                <Text style={styles.buttonTitle}>Update from zip file</Text>
              </Pressable>
              <Spacer size={50} vertical />
              <Pressable 
                onPress={async () => {
                  setAssetPath(await downloadLuti())
                }}
                style={styles.buttonStyle}>
                <Text style={styles.buttonTitle}>Download test version</Text>
              </Pressable>
              <Spacer size={50} vertical />
              {progressMessage !== "" ? <Text style={styles.progressTitle}>{progressMessage}</Text> : null}
              <Spacer size={10} vertical />
              {progressMessage !== "" ? <Progress.Bar progress={progress} width={200} /> : null}
            </View>
          </View>;
    } else {
        return <AssetContext.Provider value={assetPath}>
            {children}
        </AssetContext.Provider>
    }
}
