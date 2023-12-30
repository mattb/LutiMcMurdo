import { useEffect, useState, useContext, createContext } from 'react'
import * as Progress from 'react-native-progress';
import DocumentPicker from 'react-native-document-picker'
import { exists as fileExists, readDir, DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';
import { subscribe, unzip } from 'react-native-zip-archive'
import {
    //StyleSheet,
    View,
    Text,
    Button,
} from 'react-native';

const AssetContext = createContext(null);

export const useAssetPath = () => {
    return useContext(AssetContext);
}

export const AssetUpdater = ({ children }) => {
    const [progress, setProgress] = useState(0.0);
    const [isShowingProgress, setIsShowingProgress] = useState(false);
    const [assetPath, setAssetPath] = useState('');

    const onUpdate = async (): Promise<string> => {
        const subscription = subscribe(function ({
            progress: zipProgress,
            filePath,
        }) {
            setProgress(zipProgress);
        });

        const { uri } = await DocumentPicker.pickSingle({
            type: "public.zip-archive",
            mode: "open",
            presentationStyle: 'fullScreen'
        });
        if (uri !== null) {
            const srcPath = decodeURI(uri.substring(7));
            const targetPath = `${DocumentDirectoryPath}/luti-${Date.now()}`;
            setIsShowingProgress(true);
            setProgress(0.0);
            const unzipPath = await unzip(srcPath, targetPath);
            if (await fileExists(unzipPath + "/asset-manifest.json")) {
                subscription.remove();
                setIsShowingProgress(false);
                return unzipPath;
            }
        }
        subscription.remove();
        setIsShowingProgress(false);
        throw new Error("Didn't find a LUTI website in zip file");
    }

    const getLatestAssetDirectory = async (): Promise<string> => {
        const lutiDir = (await readDir(DocumentDirectoryPath))

        const last = lutiDir
            .filter(d => d.isDirectory() && d.name.startsWith("luti-"))
            .sort(d => d.mtime.getTime())
            .findLast(i => i.isDirectory() && i.name.startsWith("luti-"));
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
                //pass
            }
        };
        getLatest()
            .catch(console.error);
    }, []);

    if (assetPath === '') {
        return <View style={{ justifyContent: 'center', flex: 1 }}>
            <Text>hi</Text>
            <Button onPress={async () => {
                setAssetPath(await onUpdate())
            }} title="Update" />
            <Progress.Bar progress={progress} width={200} />
        </View>;
    } else {
        return <AssetContext.Provider value={assetPath}>
            {children}
        </AssetContext.Provider>
    }
}