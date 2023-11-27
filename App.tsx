/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { Component } from 'react';
import { useEffect, useState } from 'react';
import { WebView } from 'react-native-webview';

import Server from '@dr.pogodin/react-native-static-server';
import {ERROR_LOG_FILE} from '@dr.pogodin/react-native-static-server';
import {resolveAssetsPath} from '@dr.pogodin/react-native-static-server';

import type {PropsWithChildren} from 'react';
import { SafeAreaInsetsContext, SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import {
  Colors,
  DebugInstructions,
  Header,
  LearnMoreLinks,
  ReloadInstructions,
} from 'react-native/Libraries/NewAppScreen';

type SectionProps = PropsWithChildren<{
  title: string;
}>;

export default function Webserver() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    let server = new Server({
      // See further in the docs how to statically bundle assets into the App,
      // alernatively assets to serve might be created or downloaded during
      // the app's runtime.
      fileDir: resolveAssetsPath("src"),
      port: 50050,
      extraConfig: `
server.modules += ("mod_setenv")
$HTTP["url"] =~ "/videos" {
  setenv.add-response-header += (
      "Access-Control-Allow-Origin" => "*"
  )
}
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
      if (server) setOrigin(await server.start());
    })();

    return () => {
      console.log("FOO");
      setOrigin('');

      // No harm to trigger .stop() even if server has not been launched yet.
      server.stop();

      server = undefined;
    }
  }, []);

  return (
<>
      <WebView
          injectedJavaScriptBeforeContentLoaded={`
                window.onerror = function(message, sourcefile, lineno, colno, error) {
                  alert("Message: " + message + " - Source: " + sourcefile + " Line: " + lineno + ":" + colno);
                  return true;
                };
                true;
              `}
          webviewDebuggingEnabled={ true }
          source={{ uri: origin + "/",
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
          }}
          originWhitelist={['*']}
          allowsInlineMediaPlayback={ true }
          mediaPlaybackRequiresUserAction={ false }
          mixedContentMode={ "always" }
          onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView error: ', nativeEvent);
            }}
          style={{ marginTop: 59 }}
        />
</>
  );
}

function App(): JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <Luti />
  );
}

class Luti extends Component {
  render() {
    return (
      <Webserver />
    );
  }
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
