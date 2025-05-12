const WebSocket = require("ws");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const tmp = require("tmp");
const player = require("play-sound")({});
const path = require("path");
const { PassThrough } = require("stream");

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

  // Create unique session ID
  const sessionId = Date.now().toString();
  
  // Set up file paths
  const chunkDir = path.join(tmpDir.name, `chunks-${sessionId}`);
  fs.mkdirSync(chunkDir, { recursive: true });
  
  // Track chunks and playback
  let chunkCount = 0;
  let playbackStarted = false;
  let currentPlayingChunk = 0;
  let dataReceived = false;
  let processingInProgress = false;
  
  // Track audio process
  let ffmpegProcess = null;
  
  // Function to process and play a chunk
  const processAndPlayNextChunk = () => {
    if (currentPlayingChunk >= chunkCount || processingInProgress) return;
    
    processingInProgress = true;
    console.log(`Processing chunk ${currentPlayingChunk}/${chunkCount}`);
    
    const inputChunk = path.join(chunkDir, `chunk-${currentPlayingChunk}.mp4`);
    const outputChunk = path.join(chunkDir, `chunk-${currentPlayingChunk}.wav`);
    
    tempFiles.push(outputChunk);
    
    ffmpeg(inputChunk)
      .noVideo()
      .audioCodec("pcm_s16le")
      .audioChannels(2)
      .audioFrequency(44100)
      .output(outputChunk)
      .on("error", (err) => {
        console.error(`FFmpeg error processing chunk ${currentPlayingChunk}:`, err);
        processingInProgress = false;
        currentPlayingChunk++;
        
        // Try the next chunk
        processAndPlayNextChunk();
      })
      .on("end", () => {
        console.log(`FFmpeg finished processing chunk ${currentPlayingChunk}`);
        
        // Play the audio
        player.play(outputChunk, (err) => {
          if (err) {
            console.error(`Error playing chunk ${currentPlayingChunk}:`, err);
          } else {
            console.log(`Finished playing chunk ${currentPlayingChunk}`);
          }
          
          // Clean up this chunk
          try {
            fs.unlinkSync(inputChunk);
            fs.unlinkSync(outputChunk);
          } catch (e) {
            console.error("Error deleting chunk files:", e);
          }
          
          // Move to next chunk
          currentPlayingChunk++;
          processingInProgress = false;
          
          // Process next chunk if available
          processAndPlayNextChunk();
        });
      })
      .run();
  };
  
  // Process incoming data as smaller chunks
  ws.on("message", (data) => {
    // Check if it's the end signal
    if (typeof data === 'string' || (data instanceof Buffer && data.toString() === 'end')) {
      console.log("Received end signal");
      
      // Process any remaining chunks
      if (dataReceived && !playbackStarted && chunkCount > 0) {
        playbackStarted = true;
        processAndPlayNextChunk();
      }
      
      // Send status to client
      ws.send(JSON.stringify({ status: "processing_complete", message: "All data received" }));
      return;
    }
    
    // Handle normal data
    console.log(`Received ${data.length} bytes of data`);
    dataReceived = true;
    
    // Write data to a new chunk file
    const chunkFile = path.join(chunkDir, `chunk-${chunkCount}.mp4`);
    fs.writeFileSync(chunkFile, data);
    tempFiles.push(chunkFile);
    chunkCount++;
    
    // Send acknowledgment to client
    ws.send(JSON.stringify({ status: "chunk_received", chunkId: chunkCount-1 }));
    
    // Start playback if this is the first chunk or we have enough buffered
    if (!playbackStarted && chunkCount >= 2) {  // Start after 2 chunks for buffer
      playbackStarted = true;
      processAndPlayNextChunk();
    }
  });
  
  // Handle client disconnect
  ws.on("close", () => {
    console.log("Client disconnected");
    
    // Clean up chunk directory
    try {
      if (fs.existsSync(chunkDir)) {
        const files = fs.readdirSync(chunkDir);
        files.forEach(file => {
          try {
            fs.unlinkSync(path.join(chunkDir, file));
          } catch (e) {
            // Ignore errors
          }
        });
        fs.rmdirSync(chunkDir);
      }
    } catch (err) {
      console.error("Error cleaning up chunk directory:", err);
    }
    
    console.log("Connection closed and resources cleaned up");
  });
  
  // Handle errors
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
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