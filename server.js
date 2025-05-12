const WebSocket = require("ws");
const ffmpeg = require("fluent-ffmpeg");
const { WritableStreamBuffer } = require("stream-buffers");
const stream = require("stream");
const fs = require("fs");
const tmp = require("tmp");
const player = require("play-sound")({});
const path = require("path");

// Create a websocket server
const wss = new WebSocket.Server({ port: 8080 });

console.log("WebSocket server started on port 8080");

// Create a temporary directory for storing audio files
const tmpDir = tmp.dirSync({ unsafeCleanup: true });
console.log(`Created temporary directory: ${tmpDir.name}`);

// Keep track of files for cleanup
const tempFiles = [];

// Clean up temporary files on exit
process.on("exit", () => {
  console.log("Cleaning up temporary files...");
  tempFiles.forEach((file) => {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (err) {
      console.error(`Error deleting file ${file}:`, err);
    }
  });

  try {
    tmpDir.removeCallback();
  } catch (err) {
    console.error("Error cleaning temp directory:", err);
  }
});

// Handle connections
wss.on("connection", (ws) => {
  console.log("Client connected");

  // Create a unique filename for this connection
  const fileId = Date.now().toString();
  const tempInputFile = path.join(tmpDir.name, `input-${fileId}.mp4`);
  const tempOutputFile = path.join(tmpDir.name, `output-${fileId}.wav`);

  // Add to cleanup list
  tempFiles.push(tempInputFile);
  tempFiles.push(tempOutputFile);

  // Create a write stream for the input file
  const fileStream = fs.createWriteStream(tempInputFile);
  let dataReceived = false;

  // Handle incoming messages (MP4 data chunks)
  ws.on("message", (data) => {
    // Check if the message is the end signal (string message)
    if (typeof data === 'string' || data instanceof Buffer && data.toString() === 'end') {
      const dataStr = data.toString();
      if (dataStr === 'end') {
        console.log("Received end signal, processing file...");
        fileStream.end();
        
        // Process the file if we received data
        if (dataReceived) {
        console.log("Processing received data...");
        
        // Process the file with FFmpeg
        ffmpeg(tempInputFile)
          .noVideo()
          .audioCodec("pcm_s16le")
          .audioChannels(2)
          .audioFrequency(44100)
          .output(tempOutputFile)
          .on("error", (err) => {
            console.error("FFmpeg error:", err);
            ws.send(JSON.stringify({ status: "error", message: "FFmpeg error: " + err.message }));
          })
          .on("end", () => {
            console.log("FFmpeg processing finished, playing audio...");
            ws.send(JSON.stringify({ status: "processing_complete" }));

            // Play the audio file
            player.play(tempOutputFile, (err) => {
              if (err) {
                console.error("Error playing audio:", err);
                ws.send(JSON.stringify({ status: "error", message: "Error playing audio: " + err.message }));
              } else {
                console.log("Audio playback completed");
                ws.send(JSON.stringify({ status: "playback_complete" }));
              }

              // Clean up files after playing
              setTimeout(() => {
                try {
                  if (fs.existsSync(tempInputFile)) {
                    fs.unlinkSync(tempInputFile);
                    console.log(`Deleted input file: ${tempInputFile}`);
                  }
                  if (fs.existsSync(tempOutputFile)) {
                    fs.unlinkSync(tempOutputFile);
                    console.log(`Deleted output file: ${tempOutputFile}`);
                  }
                } catch (err) {
                  console.error("Error cleaning up files:", err);
                }
              }, 1000);
            });
          })
          .run();
        }
        return;
      }
    }
    
    console.log(`Received ${data.length} bytes of data`);
    dataReceived = true;

    // Write the data to the file
    fileStream.write(data);
  });

  // Handle client disconnect or close
  ws.on("close", () => {
    console.log("Client disconnected");

    // End the file stream if it hasn't been ended already
    if (fileStream && !fileStream.closed) {
      fileStream.end();
    }
    
    // We don't need to process here anymore since we're handling it in the 'end' message
    // Just log the disconnection
    console.log("Connection closed and resources cleaned up");
  });

  // Handle errors
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    fileStream.end();
  });
});

// Handle server errors
wss.on("error", (err) => {
  console.error("Server error:", err);
});

// Handle process termination
["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down...`);
    process.exit(0);
  });
});
