/**
 * @format
 */

import 'react-native';
import React from 'react';
import {it, jest} from '@jest/globals';

const mockStart = jest.fn<() => Promise<string>>().mockResolvedValue('http://127.0.0.1:50050');
const mockStop = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRestart = jest.fn();

jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));

jest.mock('@dr.pogodin/react-native-static-server', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({start: mockStart, stop: mockStop})),
    ERROR_LOG_FILE: '/tmp/errorlog.txt',
  };
});

jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
  unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock('../AssetUpdater', () => ({
  AssetUpdater: ({children}: { children: React.ReactNode }) => children,
  useAssetPath: () => '/tmp/luti',
}));

jest.mock('react-native-restart', () => ({
  __esModule: true,
  default: {
    restart: mockRestart,
  },
}));

import App from '../App';

import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});
