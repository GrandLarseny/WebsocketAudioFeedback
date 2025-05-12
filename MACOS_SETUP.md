# macOS Setup Instructions

The `speaker` package requires certain dependencies to work properly on macOS.

## Prerequisites

1. Install Homebrew if you don't already have it:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install required audio dependencies:
```
brew install portaudio
```

## Alternative Approach

If you continue to have issues with the `speaker` package on macOS, an alternative is to use a different audio playback approach:

1. Change package.json to use `node-wav-player` instead:
```
npm uninstall speaker
npm install node-wav-player
```

2. Then modify the server code to save the audio to a temporary WAV file and play it.

## Common Issues

If you encounter errors related to XCode Command Line Tools, run:
```
xcode-select --install
```

For other audio library issues, you might need:
```
brew install pkg-config
```