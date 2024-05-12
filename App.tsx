import React, { Component, useEffect, useState, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import Server, { ERROR_LOG_FILE } from '@dr.pogodin/react-native-static-server';
import { AssetUpdater, useAssetPath } from "./AssetUpdater";
import RNRestart from 'react-native-restart'; 

import type { PropsWithChildren } from 'react';
import {
  StyleSheet,
  StatusBar,
  Text,
  useColorScheme,
  InteractionManager
} from 'react-native';

import {
  Colors
} from 'react-native/Libraries/NewAppScreen';

const TOUCH_TIMEOUT = 10 * 60 * 1000 // 10 minutes;
// const TOUCH_TIMEOUT = 20000;

type SectionProps = PropsWithChildren<{
  title: string;
}>;

const LoadingScreen = () => {
  return <Text>Loading...</Text>;
}

function Webserver() {
  const [origin, setOrigin] = useState('');
  const watchDogTimer = useRef(Date.now());

  const assetPath = useAssetPath();

  useEffect(() => {
    const runCallback = () => {
      InteractionManager.runAfterInteractions(() => {
        if(Date.now() - watchDogTimer.current > TOUCH_TIMEOUT) {
          console.log("⏰ UNUSED APP ALARM", Date.now() - watchDogTimer.current);
          watchDogTimer.current = Date.now();
          RNRestart.restart();
          return;
        }
        // Schedule the next callback after 10 seconds
        setTimeout(runCallback, 10000);
      });
    };

    // Start the initial callback
    runCallback();

    // Clean up the interaction on component unmount
    return () => {
      InteractionManager.clearInteractionHandle(runCallback);
    };
  }, []);

  useEffect(() => {
    console.log("ERROR LOG FILE", ERROR_LOG_FILE);
    console.log("SOURCE DIRECTORY", assetPath);
    let server = new Server({
      fileDir: assetPath,
      port: 50050,
      extraConfig: `
server.modules += ("mod_setenv")
$HTTP["url"] =~ "/videos" {
  setenv.add-response-header += (
      "Access-Control-Allow-Origin" => "*"
  )
}
server.modules += ("mod_rewrite")
url.rewrite-once = ("^/(about|thanks)" => "/index.html")
      `,
      errorLog: {
        conditionHandling: true,
        fileNotFound: true,
        requestHandling: true,
        requestHeader: true,
        requestHeaderOnError: true,
        responseHeader: true,
        timeouts: true,
      },
      stopInBackground: true,
    });
    (async () => {
      // You can do additional async preparations here; e.g. on Android
      // it is a good place to extract bundled assets into an accessible
      // location.

      // Note, on unmount this hook resets "server" variable to "undefined",
      // thus if "undefined" the hook has unmounted while we were doing
      // async operations above, and we don't need to launch
      // the server anymore.
      if (server) {
        console.log("SERVER START...");
        const origin = await server.start();
        console.log("SERVER STARTED", origin);
        setOrigin(origin);
      }
    })();

    return () => {
      setOrigin('');

      // No harm to trigger .stop() even if server has not been launched yet.
      server.stop();

      server = undefined;
    }
  }, [assetPath]);

  if (origin !== '') {
    return (
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <StatusBar hidden={true} />
        <WebView
          source={{
            uri: origin + "/?offline=1",
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
          }}
          pointerEvents="box-none"
          onTouchStart={ () => watchDogTimer.current = Date.now() }
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          menuItems={[]}
          mixedContentMode={"always"}
          originWhitelist={['*']}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          textInteractionEnabled={false}
          webviewDebuggingEnabled={false}
        />
      </SafeAreaView>
    );
  } else {
    return <LoadingScreen />;
  }
}

function App(): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <SafeAreaProvider>
      <Luti />
    </SafeAreaProvider>
  );
}

const Luti = () => {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <StatusBar hidden={true} />
      <AssetUpdater>
        <Webserver />
      </AssetUpdater>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default App;
