/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import BackgroundFetch from 'react-native-background-fetch';
import {headlessTask} from './src/polling/poller';

AppRegistry.registerComponent(appName, () => App);

// Runs when Android fires the background task while the app is killed
BackgroundFetch.registerHeadlessTask(headlessTask);
