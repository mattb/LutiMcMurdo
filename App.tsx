import React, { useEffect, useState, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import Server, { ERROR_LOG_FILE } from '@dr.pogodin/react-native-static-server';
import { exists as fileExists, unlink } from '@dr.pogodin/react-native-fs';
import { AssetUpdater, useAssetPath } from "./AssetUpdater";
import RNRestart from 'react-native-restart'; 

import {
  StatusBar,
  Text,
} from 'react-native';

const TOUCH_TIMEOUT = 10 * 60 * 1000 // 10 minutes;
// const TOUCH_TIMEOUT = 20000;

const LoadingScreen = () => {
  return <Text>Loading...</Text>;
}

function Webserver() {
  const [origin, setOrigin] = useState('');
  const watchDogTimer = useRef(Date.now());
  const watchdogTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const assetPath = useAssetPath();

  useEffect(() => {
    if (!assetPath) {
      return;
    }

    let mounted = true;
    let server: Server | null = new Server({
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
      // Leave file logging disabled in production so Lighttpd does not append
      // to ERROR_LOG_FILE in app storage. For debugging, restore `errorLog`
      // with the desired flags temporarily, then purge the file afterward.
      errorLog: false,
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
        if (!mounted) {
          await server.stop();
          return;
        }
        console.log("SERVER STARTED", origin);
        setOrigin(origin);
      }
    })();

    const runWatchdogTimer = () => {
      if (!mounted) {
        return;
      }

      if(Date.now() - watchDogTimer.current > TOUCH_TIMEOUT) {
        console.log("⏰ UNUSED APP ALARM", Date.now() - watchDogTimer.current);
        watchDogTimer.current = Date.now();
        console.log("SERVER STOPPING FOR RESTART... ");
        server?.stop().then(() => {
          console.log("... SERVER STOPPED FOR RESTART");
          server = null;
          RNRestart.restart();
        });
        return;
      }

      watchdogTimeout.current = setTimeout(runWatchdogTimer, 10000);
    };
    runWatchdogTimer();

    return () => {
      mounted = false;
      setOrigin('');

      if (watchdogTimeout.current) {
        clearTimeout(watchdogTimeout.current);
        watchdogTimeout.current = null;
      }

      console.log("SERVER STOPPING FOR UNMOUNT");
      // No harm to trigger .stop() even if server has not been launched yet.
      server?.stop().then(() => {
        console.log("SERVER STOPPED FOR UNMOUNT");
        server = null;
      });
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
  useEffect(() => {
    const purgeStaticServerLogs = async () => {
      try {
        if (await fileExists(ERROR_LOG_FILE)) {
          await unlink(ERROR_LOG_FILE);
        }
      } catch {
        // Ignore cleanup failures; the app can continue without persisted logs.
      }
    };

    purgeStaticServerLogs().catch(() => {
      // Ignore cleanup failures; the app can continue without persisted logs.
    });
  }, []);

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

export default App;
