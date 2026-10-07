// ML Kit is Android-only: iOS reads text with Apple Vision (modules/apple-text),
// and ML Kit's iOS pods have no arm64 simulator slice, which iOS 26 simulators need.
module.exports = {
  dependencies: {
    '@react-native-ml-kit/text-recognition': { platforms: { ios: null } },
  },
};
