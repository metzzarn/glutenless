const { withMainActivity } = require('expo/config-plugins');

/**
 * Makes a link that arrives while the app is starting the one it opens.
 *
 * MainActivity is singleTask, so a link sent to a running app arrives in
 * onNewIntent, which React Native forwards to JavaScript as a "url" event.
 * While JavaScript is still loading nothing hears that event, and Expo
 * Router opens the activity's original intent instead (React Native's
 * getInitialURL reads it): the previous link. That happened to links sent
 * over adb right after an install, when Android relaunches the app on its
 * last page. Keeping the newest intent as the activity's own fixes it.
 */
const MARKER = '// withLatestIntent';

module.exports = function withLatestIntent(config) {
  return withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes(MARKER)) return mod;
    if (mod.modResults.language !== 'kt') throw new Error('withLatestIntent: MainActivity is not Kotlin');
    const cls = /class MainActivity : ReactActivity\(\) \{\n/;
    if (!cls.test(src)) throw new Error('withLatestIntent: MainActivity class not found');
    src = src.replace(
      cls,
      (m) =>
        `${m}  ${MARKER}: getInitialURL reads the activity's intent, so keep the newest one.\n` +
        '  override fun onNewIntent(intent: Intent) {\n' +
        '    super.onNewIntent(intent)\n' +
        '    setIntent(intent)\n' +
        '  }\n\n',
    );
    if (!src.includes('import android.content.Intent\n')) src = src.replace(/^(package .*\n\n)/, '$1import android.content.Intent\n');
    mod.modResults.contents = src;
    return mod;
  });
};
