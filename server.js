const WebSocket = require("ws");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const tmp = require("tmp");
const player = require("play-sound")({});
const path = require("path");

// Create a websocket server
const wss = new WebSocket.Server({ port: 8080 });

console.log("WebSocket server started on port 8080");

// Parse URL parameters from WebSocket connection
function parseQueryString(url) {
  if (!url || !url.includes('?')) return {};
  const queryString = url.split('?')[1];
  const params = {};
  queryString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    params[key] = value !== undefined ? decodeURIComponent(value) : true;
  });
  return params;
}

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
wss.on("connection", (ws, req) => {
  console.log("Client connected");
  
  // Parse query parameters from the connection URL
  const queryParams = parseQueryString(req.url);
  const waitForDisconnect = queryParams.waitForDisconnect === 'true';
  console.log(`waitForDisconnect parameter: ${waitForDisconnect}`);

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
  let processingComplete = false;
  let clientDisconnected = false;
  
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
    } else if (mediaRecorderFormat) {
      // Special handling for MediaRecorder formats
      command.inputOption('-fflags +genpts');
      
      // For MediaRecorder streams, input format might be ambiguous
      // Try to use the specific format first but add fallbacks
      try {
        command.inputFormat(fileFormat);
      } catch (err) {
        console.warn(`Error setting input format, trying fallback options: ${err.message}`);
      }
      
      // Add specific options based on the MIME type
      if (mediaMimeType.startsWith('audio/')) {
        console.log(`Processing MediaRecorder audio format: ${mediaMimeType}`);
        // Try codec detection first
        command.inputOption('-acodec auto');
      } else if (mediaMimeType.startsWith('video/')) {
        console.log(`Processing MediaRecorder video format: ${mediaMimeType}`);
        if (mediaMimeType.includes('webm')) {
          command.inputOption('-acodec opus');
        } else {
          command.inputOption('-acodec aac');
        }
      }
      
      // Add extra options to help with handling potentially malformed data
      command.inputOption('-err_detect ignore_err');
    }
    
    // Determine whether to strip video (don't for audio-only formats)
    if (fileFormat === 'mp4' || fileFormat === 'webm') {
      command.noVideo();
    }
    
    // Add special options for MediaRecorder format
    if (mediaRecorderFormat) {
      console.log(`Processing MediaRecorder format with special handling: ${mediaMimeType}`);
      command.outputOption('-avoid_negative_ts make_zero');
      command.outputOption('-analyzeduration 2147483647');
      command.outputOption('-probesize 2147483647');
      
      // Add additional options for better handling of potentially incomplete streams
      command.outputOption('-max_muxing_queue_size 9999');
      command.outputOption('-fflags +discardcorrupt+genpts');
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
        
        // Play the audio file (or wait for disconnect if that option is set)
        playAudio();
      })
      .run();
  };
  
  // Function to play the processed audio
  const playAudio = () => {
    // If waitForDisconnect is true and client is still connected, don't play yet
    if (waitForDisconnect && !clientDisconnected) {
      console.log("Processing complete but waiting for client to disconnect before playback");
      ws.send(JSON.stringify({ status: "waiting_for_disconnect" }));
      processingComplete = true;
      return;
    }
    
    playbackStarted = true;
    
    // Only send status if client is still connected
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ status: "playback_started" }));
    }
    
    player.play(tempOutputFile, (err) => {
      if (err) {
        console.error("Error playing audio:", err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ status: "error", message: "Error playing audio: " + err.message }));
        }
      } else {
        console.log("Audio playback completed");
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ status: "playback_complete" }));
        }
      }
      
      // Clean up files after playing
    cleanupFiles();
  });
    
  console.log(`Started playback of audio file in ${fileFormat} format${mediaRecorderFormat ? ` (original: ${mediaMimeType})` : ''}`);
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
  let mediaRecorderFormat = false; // Flag to indicate if the data is from MediaRecorder
  let mediaMimeType = ''; // Store the original MIME type from MediaRecorder
  
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
        // Check if it's a MediaRecorder MIME type
        if (newFormat.includes('/')) {
          mediaMimeType = newFormat;
          mediaRecorderFormat = true;
          
          // Extract container format from MIME type
          if (newFormat.includes('mp4')) {
            fileFormat = 'mp4';
          } else if (newFormat.includes('webm')) {
            fileFormat = 'webm';
          } else if (newFormat.includes('mp3') || newFormat.includes('mpeg')) {
            fileFormat = 'mp3';
          } else {
            // Default to mp4 for unknown formats (with warning)
            fileFormat = 'mp4';
            console.warn(`Unknown MediaRecorder format: ${newFormat}, defaulting to ${fileFormat}`);
          }
          
          console.log(`Client specified MediaRecorder format: ${newFormat}, using ${fileFormat}`);
        } else if (['mp4', 'mp3', 'webm'].includes(newFormat)) {
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
    clientDisconnected = true;
    
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
    
    // If processing is complete but waiting for disconnect to play, play now
    if (processingComplete && !playbackStarted && waitForDisconnect) {
      console.log("Client disconnected, starting audio playback now");
      
      // Small delay to ensure all cleanup has happened
      setTimeout(() => {
        playAudio();
      }, 100);
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