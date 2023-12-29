import { useState, useContext, createContext } from 'react'
import DocumentPicker from 'react-native-document-picker'
import { unlink, mkdir, DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';
import { unzip } from 'react-native-zip-archive'
import {
    //StyleSheet,
    View,
    Text,
    Button,
} from 'react-native';

const AssetContext = createContext(null);

const onUpdate = async () => {
    const { fileCopyUri } = await DocumentPicker.pickSingle({
        type: "public.zip-archive",
        copyTo: "cachesDirectory",
        presentationStyle: 'fullScreen'
    });
    if (fileCopyUri !== null) {
        const srcPath = decodeURI(fileCopyUri.substring(7));
        console.log("SOURCE", srcPath);
        const targetPath = `${DocumentDirectoryPath}/${Date.now()}`;
        console.log("TARGET", targetPath);
        const unzipPath = await unzip(srcPath, targetPath);
        console.log("DOC", unzipPath);
        await unlink(srcPath);
        console.log("SETASSET", unzipPath);
        return unzipPath;
    }
}

export const useAssetPath = () => {
    return useContext(AssetContext);
}

export const AssetUpdater = ({ children }) => {
    const [assetPath, setAssetPath] = useState('');
    if (assetPath === '') {
        return <View style={{ justifyContent: 'center', alignItems: 'center' }}>
            <Text>hi</Text>
            <Button onPress={async () => {
                setAssetPath(await onUpdate())
            }} title="Update" />
        </View>;
    } else {
        console.log("PROVIDER ASSET PATH", assetPath);
        return <AssetContext.Provider value={assetPath}>
            {children}
        </AssetContext.Provider>
    }
}