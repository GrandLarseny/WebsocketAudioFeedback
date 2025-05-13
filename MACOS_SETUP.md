# macOS Setup Instructions

This application requires FFmpeg to be installed on your system to process audio files.

## Prerequisites

1. Install Homebrew if you don't already have it:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. Install FFmpeg:
```
brew install ffmpeg
```

## Audio Playback

The application uses the system's default audio player to play processed audio files. Make sure you have a default audio player that can handle WAV files.

## Common Issues

If you encounter errors related to XCode Command Line Tools, run:
```
xcode-select --install
```

If FFmpeg reports issues with certain codecs, you may need to reinstall it with additional options:
```
brew reinstall ffmpeg --with-opus --with-fdk-aac
```