const WebSocket = require("ws");
const ffmpeg = require("fluent-ffmpeg");
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

  // Create a unique session ID
  const sessionId = Date.now().toString();
  
  // Base file paths for this session (will update extension based on format)
  const tempInputFileBase = path.join(tmpDir.name, `input-${sessionId}`);
  const tempInputFile = tempInputFileBase + '.tmp'; // Temporary extension until format is known
  const tempOutputFile = path.join(tmpDir.name, `output-${sessionId}.wav`);
  
  // Add to cleanup list
  tempFiles.push(tempInputFile);
  tempFiles.push(tempOutputFile);
  
  // Create write stream for the input file
  const fileStream = fs.createWriteStream(tempInputFile);
  
  // Tracking variables
  let dataReceived = false;
  let bytesReceived = 0;
  let processingStarted = false;
  let playbackStarted = false;
  
  // Buffer size thresholds
  const MIN_BUFFER_TO_START = 512 * 1024; // 512KB before starting processing
  const PROCESSING_CHECK_INTERVAL = 200; // Check every 200ms if we can start processing
  let processingCheckTimer = null;
  
  // Function to start processing based on available data
  const startProcessingIfReady = () => {
    if (processingStarted || bytesReceived < MIN_BUFFER_TO_START) return;
    
    console.log(`Received ${bytesReceived} bytes, starting early processing...`);
    processingStarted = true;
    
    // Stop the check timer
    if (processingCheckTimer) {
      clearInterval(processingCheckTimer);
      processingCheckTimer = null;
    }
    
    // Begin processing with FFmpeg
    processAudio();
  };
  
  // Start the timer to check if we can begin processing
  processingCheckTimer = setInterval(startProcessingIfReady, PROCESSING_CHECK_INTERVAL);
  
  // Function to process audio with FFmpeg
  const processAudio = () => {
    console.log(`Starting FFmpeg processing for ${fileFormat} file...`);
    ws.send(JSON.stringify({ status: "processing_started", format: fileFormat }));
    
    // Update input file extension based on format
    const inputWithCorrectExt = tempInputFileBase + '.' + fileFormat;
    
    // Rename file to have the correct extension
    try {
      fs.renameSync(tempInputFile, inputWithCorrectExt);
      console.log(`Renamed input file to match format: ${fileFormat}`);
    } catch (err) {
      console.error(`Error renaming file: ${err}`);
      // If rename fails, continue with original file
    }
    
    // Create FFmpeg command based on file format
    const command = ffmpeg(fs.existsSync(inputWithCorrectExt) ? inputWithCorrectExt : tempInputFile)
      .audioCodec("pcm_s16le")
      .audioChannels(2)
      .audioFrequency(44100)
      .output(tempOutputFile);
    
    // Add format-specific options
    if (fileFormat === 'webm') {
      command.inputOption('-threads 4');
    } else if (fileFormat === 'mp3') {
      // MP3 specific options if needed
      command.inputOption('-acodec mp3');
    }
    
    // Determine whether to strip video (don't for audio-only formats)
    if (fileFormat === 'mp4' || fileFormat === 'webm') {
      command.noVideo();
    }
    
    // Execute the command with all options set
    command
      .on("start", (commandLine) => {
        console.log("FFmpeg process started:", commandLine);
      })
      .on("progress", (progress) => {
        // If we have progress info, send it to the client
        if (progress.percent) {
          console.log(`Processing: ${progress.percent.toFixed(1)}% done`);
          ws.send(JSON.stringify({ status: "processing_progress", percent: progress.percent }));
        }
      })
      .on("error", (err) => {
        console.error("FFmpeg error:", err.message);
        ws.send(JSON.stringify({ status: "error", message: "FFmpeg error: " + err.message }));
      })
      .on("end", () => {
        console.log("FFmpeg processing finished, playing audio...");
        ws.send(JSON.stringify({ status: "processing_complete" }));
        
        // Play the audio file
        playAudio();
      })
      .run();
  };
  
  // Function to play the processed audio
  const playAudio = () => {
    playbackStarted = true;
    ws.send(JSON.stringify({ status: "playback_started" }));
    
    player.play(tempOutputFile, (err) => {
      if (err) {
        console.error("Error playing audio:", err);
        ws.send(JSON.stringify({ status: "error", message: "Error playing audio: " + err.message }));
      } else {
        console.log("Audio playback completed");
        ws.send(JSON.stringify({ status: "playback_complete" }));
      }
      
      // Clean up files after playing
      cleanupFiles();
    });
  };
  
  // Function to clean up files
  const cleanupFiles = () => {
    // Clean up files after playing
    setTimeout(() => {
      try {
        // Check all possible input files with various extensions
        const possibleInputFiles = [
          tempInputFile,
          tempInputFileBase + '.mp4',
          tempInputFileBase + '.mp3',
          tempInputFileBase + '.webm'
        ];
        
        // Delete any existing input files
        possibleInputFiles.forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`Deleted input file: ${file}`);
          }
        });
                
        // Delete output file
        if (fs.existsSync(tempOutputFile)) {
          fs.unlinkSync(tempOutputFile);
          console.log(`Deleted output file: ${tempOutputFile}`);
        }
      } catch (err) {
        console.error("Error cleaning up files:", err);
      }
    }, 1000);
  };
  
  // Track file format
  let fileFormat = 'mp4'; // Default format
  
  // Process incoming messages (audio/video data chunks)
  ws.on("message", (data) => {
    // Check if this is a control message
    if (typeof data === 'string' || (data instanceof Buffer && data.byteLength < 100)) {
      const message = data.toString();
      
      // Check for end signal
      if (message === 'end') {
        console.log("Received end signal from client");
        ws.send(JSON.stringify({ status: "all_data_received" }));
        
        // End the file stream
        fileStream.end();
        
        // If we haven't started processing yet but have received data, start now
        if (!processingStarted && dataReceived) {
          processAudio();
        }
        return;
      }
      
      // Check for format information
      if (message.startsWith('format:')) {
        const newFormat = message.split(':')[1].trim();
        if (['mp4', 'mp3', 'webm'].includes(newFormat)) {
          fileFormat = newFormat;
          console.log(`Client specified file format: ${fileFormat}`);
        } else {
          console.warn(`Ignoring unsupported format: ${newFormat}, using ${fileFormat} instead`);
        }
        return;
      }
    }
    
    // Normal data chunk
    dataReceived = true;
    bytesReceived += data.length;
    console.log(`Received chunk: ${data.length} bytes (total: ${bytesReceived} bytes)`);
    
    // Write data to the file
    fileStream.write(data);
    
    // Acknowledge receipt to client
    ws.send(JSON.stringify({ 
      status: "chunk_received", 
      bytes: data.length, 
      totalBytes: bytesReceived 
    }));
    
    // Check if we should start processing
    startProcessingIfReady();
  });
  
  // Handle client disconnect
  ws.on("close", () => {
    console.log("Client disconnected");
    
    // Clean up timer
    if (processingCheckTimer) {
      clearInterval(processingCheckTimer);
      processingCheckTimer = null;
    }
    
    // If we haven't ended the file stream yet, do it now
    if (fileStream && !fileStream.closed) {
      fileStream.end();
    }
    
    // If we received data but never started processing, start now
    if (dataReceived && !processingStarted) {
      processAudio();
    }
  });
  
  // Handle errors
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    
    // Clean up timer
    if (processingCheckTimer) {
      clearInterval(processingCheckTimer);
    }
    
    // End file stream if it's still open
    if (fileStream && !fileStream.closed) {
      fileStream.end();
    }
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