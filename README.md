# WebSocket Player

A Node.js WebSocket server that receives audio/video data (MP4, MP3, WebM, or MediaRecorder streams) via WebSocket and quickly processes it for playback on the server's speakers, using progressive buffering for faster audio feedback. Supports direct streaming from browser's MediaRecorder API.

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
4. Select an MP4, MP3, or WebM file using the file input
5. (Optional) Choose the file format or leave it on "Auto Detect"
6. (Optional) Select "Live Recording" format and use the "Record" button to stream live audio
7. (Optional) Adjust the chunk size for optimal transfer performance
8. (Optional) Check "Wait to play until disconnected" to have the server delay playback until client disconnection
9. Click "Send File" to stream the file to the server (or "Record" to stream from microphone)
9. Audio processing starts automatically after receiving 512KB of data
10. Visual progress bar shows processing status
11. Audio playback begins as soon as processing completes (or after client disconnection if the wait option was selected)

## How It Works

1. The client connects to the WebSocket server
2. The client sends audio/video data in small chunks to the server
3. The server uses a progressive buffering approach:
   - Data is accumulated in a single file
   - Processing begins after receiving a minimum buffer (512KB by default)
   - FFmpeg extracts and converts the audio to WAV format
   - Audio playback starts as soon as processing completes (or after client disconnection if `waitForDisconnect=true` parameter is used)
4. This approach balances fast audio playback with proper media file processing
5. Temporary files are cleaned up after playback

## Advanced Options

### Live Audio Recording

You can record and stream audio directly from your browser's microphone using the MediaRecorder API:

1. Select "Live Recording" from the format dropdown
2. Click the "Record" button to begin capturing from your microphone
3. The audio is streamed in real-time to the server as it's being recorded
4. Click "Stop Recording" to finish and signal the server to complete processing
5. This feature automatically detects and uses the best supported format for your browser (video/mp4, audio/mp4, video/webm, audio/webm)

### Delayed Playback

You can use the `waitForDisconnect` parameter to have the server wait until the client disconnects before playing back audio:

1. Add the query parameter when connecting: `ws://localhost:8080?waitForDisconnect=true`
2. In the test client, simply check the "Wait to play until disconnected" option
3. The server will process the audio as usual but will delay playback until the WebSocket connection is closed
4. This is useful for scenarios where you want to ensure all data is processed before playback begins

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
- If data transfer is slow, try increasing the chunk size in the client interface
- If processing is slow, consider adjusting the `MIN_BUFFER_TO_START` value in server.js
- The server requires a complete file header to process audio correctly, which is why progressive buffering is used instead of processing individual chunks
- For MP3 files, make sure FFmpeg is compiled with MP3 support
- For WebM files, playback quality may depend on the audio codec used in the original file
- For MediaRecorder streams, your browser must support the MediaRecorder API with one of the following MIME types: video/mp4, audio/mp4, video/webm, or audio/webm