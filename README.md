# WebSocket Player

A Node.js WebSocket server that receives buffered MP4 data and plays it on the server's speakers for testing purposes.

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
4. Select an MP4 file using the file input
5. Click "Send File" to send the MP4 file to the server for playback

## How It Works

1. The client connects to the WebSocket server
2. The client sends MP4 data in chunks to the server
3. The server saves the MP4 data to a temporary file
4. When the client disconnects (or finishes sending), the server:
   - Uses FFmpeg to extract and convert the audio to WAV format
   - Plays the audio using your system's default audio player
   - Cleans up temporary files after playback

## Platform-Specific Notes

### macOS
- macOS users should have a default audio player that can handle WAV files (QuickTime)
- FFmpeg can be installed via: `brew install ffmpeg`
- See `MACOS_SETUP.md` for any macOS-specific troubleshooting

### Windows
- Windows users should have Windows Media Player or another default audio player
- FFmpeg needs to be installed and added to the system PATH

### Linux
- Linux users might need to install a media player like VLC
- FFmpeg can be installed via package manager

## Troubleshooting

- If you encounter issues with audio playback, verify that FFmpeg is properly installed
- For audio format issues, you may need to adjust the FFmpeg parameters in `server.js`
- Ensure you have a default media player application associated with WAV files