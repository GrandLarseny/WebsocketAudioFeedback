# WebSocket Player

A Node.js WebSocket server that receives buffered MP4 data and plays it on the server's speakers in real-time, with optimized streaming playback for faster audio feedback.

## Requirements

- Node.js (v12+)
- npm
- FFmpeg installed on your system
- A default audio player application on your system

## Installation

1. Clone this repository
2. Install dependencies:

```
npm install
```

3. Make sure you have FFmpeg installed on your system:
   - **macOS**: `brew install ffmpeg`
   - **Ubuntu/Debian**: `sudo apt install ffmpeg`
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

## Usage

1. Start the WebSocket server:

```
npm start
```

2. Open `test-client.html` in a web browser
3. Click "Connect" to establish a WebSocket connection
4. Select an MP4 or audio file using the file input
5. (Optional) Adjust the chunk size for optimal streaming performance
6. Click "Send File" to stream the file to the server for real-time playback
7. Audio playback will begin as soon as the first chunks are processed, without waiting for the entire file

## How It Works

1. The client connects to the WebSocket server
2. The client sends MP4 data in small chunks to the server
3. The server processes each chunk individually:
   - Saves each chunk to a temporary file
   - Starts processing early chunks while later chunks are still being received
   - Converts each chunk to WAV format using FFmpeg
   - Plays each chunk as soon as it's converted
4. This approach provides near real-time audio playback without waiting for the entire file to be received
5. Temporary files are cleaned up after playback

## Platform-Specific Notes

### macOS
- macOS users should have a default audio player that can handle WAV files (QuickTime)
- FFmpeg can be installed via: `brew install ffmpeg`
- See `MACOS_SETUP.md` for any macOS-specific troubleshooting
- For optimal performance, ensure QuickTime or another audio player is set as the default

### Windows
- Windows users should have Windows Media Player or another default audio player
- FFmpeg needs to be installed and added to the system PATH
- For best results, make sure your audio player doesn't have a long startup time

### Linux
- Linux users might need to install a media player like VLC
- FFmpeg can be installed via package manager
- Consider using a lightweight audio player for faster chunk playback

## Troubleshooting

- If you encounter issues with audio playback, verify that FFmpeg is properly installed
- For audio format issues, you may need to adjust the FFmpeg parameters in `server.js`
- Ensure you have a default media player application associated with WAV files
- If playback is choppy, try adjusting the chunk size in the client interface
- For large files, the initial playback may have a slight delay as the first chunks are processed