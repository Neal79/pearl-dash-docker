# Audio Streaming Implementation Documentation

## 🎵 Overview

This document details the complete implementation of real-time audio streaming from Pearl Mini devices through WebSocket connections with proper mute/unmute functionality.

## 🏗️ Architecture

### Components Overview
```
┌─────────────────────┐    WebSocket    ┌─────────────────────┐    RTSP     ┌─────────────────┐
│  PearlDeviceCard    │◄──────────────►│ audio-meter-service │◄──────────►│  Pearl Device   │
│     (Frontend)      │                 │    (Node.js)        │             │   (Hardware)    │
└─────────────────────┘                 └─────────────────────┘             └─────────────────┘
           │                                       │
           │                                       │
           ▼                                       ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ useAudioStreaming   │                 │    FFmpeg Process   │
│   (Composable)      │                 │  RTSP → PCM Audio   │
└─────────────────────┘                 └─────────────────────┘
```

### Data Flow
1. **Device Selection**: User selects channel on Pearl device
2. **WebSocket Connection**: Frontend connects to `/ws/audio-meter` endpoint
3. **Audio Subscription**: Frontend sends `subscribe_audio` message with device IP and channel
4. **RTSP Processing**: Backend starts FFmpeg process to convert RTSP stream to PCM audio
5. **Audio Streaming**: Backend sends base64-encoded PCM data via WebSocket
6. **Audio Playback**: Frontend uses Web Audio API for continuous playback

## 🔧 Key Components

### 1. PearlDeviceCard.vue - Main Component

**Location**: `/resources/js/components/PearlDeviceCard.vue`

**Key Features**:
- Audio mute/unmute button with proper state management
- Integration with `useAudioStreaming` composable
- Automatic cleanup on channel changes
- User feedback with floating overlay messages

**Critical Functions**:
```typescript
// Initialize audio for selected channel
const initializeAudioForChannel = async () => {
  // Creates new useAudioStreaming instance
  // Subscribes to WebSocket audio stream
  // Returns success/failure status
}

// Toggle audio mute state
const toggleAudioMute = async () => {
  // Handles mute/unmute logic
  // Ensures WebSocket subscription is active
  // Manages audio context state
  // Provides user feedback
}
```

### 2. useAudioStreaming.ts - Audio Composable

**Location**: `/resources/js/composables/useAudioStreaming.ts`

**Key Features**:
- WebSocket connection management to audio-meter-service
- Web Audio API integration for continuous playback
- Audio buffer queue management
- Volume control and mute/unmute functionality

**Critical Functions**:
```typescript
// Process incoming audio data
const processAudioData = async (audioData: AudioData) => {
  // Converts base64 PCM to Float32Array samples
  // Adds to audio queue for playback
  // Triggers playback if not already streaming
}

// Schedule continuous audio playback
const scheduleAudioPlayback = () => {
  // Creates AudioBuffer from queue
  // Schedules seamless playback without gaps
  // Handles buffer-to-buffer transitions
  // Manages timing for continuous audio
}
```

### 3. audio-meter-service.js - Backend Service

**Location**: `/media-proxy/audio-meter-service.js`

**Key Features**:
- WebSocket server on port 3444
- FFmpeg integration for RTSP to PCM conversion
- Audio subscription management
- Base64 encoding for JSON transmission

**Critical Functions**:
```javascript
// Handle audio subscription requests
subscribeClientAudio(clientId, device, channel) {
  // Validates device and channel
  // Starts FFmpeg process if needed
  // Manages client audio subscriptions
}

// Broadcast audio data to subscribers
broadcastAudioData(streamKey, frameData, device, channel) {
  // Converts binary PCM to base64
  // Sends to all subscribed clients
  // Includes format metadata
}
```

## 🎯 Key Fixes Implemented

### Problem: Audio Dropping After First Buffer

**Root Cause**: The original implementation used `requestAnimationFrame` for scheduling next audio buffers, which created timing gaps between buffers causing audio to drop.

**Solution**: Implemented dual scheduling approach:
1. **Immediate Scheduling**: Use `sourceNode.onended` callback to immediately schedule next buffer when current buffer finishes
2. **Proactive Scheduling**: Schedule next buffer with small timeout while current buffer is still playing
3. **Resume on New Data**: Automatically resume playback when new audio data arrives after queue was empty

### Before (Broken):
```typescript
// Continue playback if more audio in queue
if (audioQueue.length > 0) {
  requestAnimationFrame(scheduleAudioPlayback) // ❌ Creates gaps
}
```

### After (Working):
```typescript
sourceNode.onended = () => {
  // Immediately try to schedule next buffer if available
  if (audioQueue.length > 0) {
    scheduleAudioPlayback() // ✅ No gaps
  }
}

// Proactively schedule next buffer
if (audioQueue.length > 0) {
  setTimeout(() => scheduleAudioPlayback(), 10) // ✅ Continuous
}
```

## 🔄 Audio Playback Flow

### Initialization Sequence
1. User clicks audio unmute button
2. `initializeAudioForChannel()` creates new `useAudioStreaming` instance
3. WebSocket connection established to `/ws/audio-meter`
4. `subscribe_audio` message sent with device IP and channel
5. Backend starts FFmpeg process for RTSP stream conversion
6. Audio context initialized and ready for playback

### Streaming Sequence
1. Backend FFmpeg converts RTSP to PCM every 100ms
2. PCM data encoded as base64 and sent via WebSocket
3. Frontend receives `audio_data` messages
4. Base64 decoded to binary, then converted to Float32Array samples
5. Samples added to audio queue
6. `scheduleAudioPlayback()` creates AudioBuffer and schedules playback
7. Continuous playback maintained through buffer chaining

### Cleanup Sequence
1. User changes channel or component unmounts
2. `unsubscribe()` called to stop audio streaming
3. WebSocket connection cleaned up
4. Audio context closed
5. All buffers and queues cleared

## 🎛️ Configuration Parameters

### Audio Format
- **Sample Rate**: 48kHz (matches Pearl device output)
- **Channels**: 2 (stereo)
- **Bit Depth**: 16-bit signed little-endian (s16le)
- **Buffer Size**: 100ms chunks (4,800 samples per buffer)

### WebSocket Settings
- **Endpoint**: `/ws/audio-meter`
- **Port**: 3444 (audio-meter-service)
- **Authentication**: JWT token in query parameter
- **Message Format**: JSON with base64-encoded audio data

### Web Audio API Settings
- **Audio Context**: 48kHz sample rate, interactive latency hint
- **Buffer Scheduling**: Seamless buffer chaining without gaps
- **Volume Control**: GainNode for mute/unmute functionality

## 🧪 Testing Scenarios

### Basic Functionality
- ✅ Audio button disabled when no channel selected
- ✅ Audio initialization on first unmute click
- ✅ Continuous audio playback after unmute
- ✅ Proper mute/unmute toggling
- ✅ Audio stops when channel changed
- ✅ Cleanup on component unmount

### Edge Cases
- ✅ WebSocket reconnection handling
- ✅ Audio context resumption after browser suspension
- ✅ Buffer underrun recovery
- ✅ Network interruption resilience
- ✅ Multiple device cards with independent audio

### Performance
- ✅ Memory management with bounded audio queues
- ✅ CPU usage optimization with efficient scheduling
- ✅ Network bandwidth appropriate for audio quality
- ✅ Browser compatibility across modern browsers

## 🔒 Security Considerations

### Authentication
- JWT token required for WebSocket connections
- Device IP validation against allowed networks
- Input sanitization for device and channel parameters

### Resource Limits
- Maximum concurrent FFmpeg processes: 50
- Maximum connections per IP: 20
- Audio buffer size limits to prevent memory exhaustion

## 🚀 Performance Optimizations

### Frontend
- Efficient Float32Array conversion from base64
- Bounded audio queue to prevent memory leaks
- Proactive buffer scheduling for seamless playback
- Cleanup resources on component destruction

### Backend
- FFmpeg process reuse for multiple subscribers
- Binary data streaming with base64 encoding
- Health monitoring for FFmpeg processes
- Automatic cleanup of stale connections

## 📁 File Locations

### Key Files
```
/resources/js/components/PearlDeviceCard.vue              # Main UI component
/resources/js/composables/useAudioStreaming.ts           # Audio streaming logic
/media-proxy/audio-meter-service.js                      # WebSocket backend service
```

### Backup Files (Safe Restore Points)
```
/resources/js/composables/useAudioStreaming-WORKING-AUDIO-TOGGLE-BACKUP.ts
/resources/js/components/PearlDeviceCard-WORKING-AUDIO-TOGGLE-BACKUP.vue
/WORKING-AUDIO-TOGGLE-BACKUP-README.md
```

## 🔮 Future Enhancements

### Potential Improvements
1. **Audio Quality**: Add configurable sample rates and bit depths
2. **Latency Optimization**: Implement adaptive buffer sizing
3. **Visual Feedback**: Add audio waveform or level indicators
4. **Multi-Channel**: Support for multiple simultaneous audio streams
5. **Recording**: Add ability to record audio streams locally
6. **Compression**: Implement audio compression for bandwidth optimization

### Monitoring
1. **Metrics**: Add audio streaming metrics and analytics
2. **Health Checks**: Implement audio quality monitoring
3. **Alerting**: Add notifications for audio stream failures
4. **Logging**: Enhanced debugging and troubleshooting logs

## 🎉 Success Metrics

### Working Features ✅
- ✅ **Continuous Audio Playback**: No more dropping after first buffer
- ✅ **Seamless Mute/Unmute**: Proper state management and user feedback
- ✅ **Channel Switching**: Clean audio cleanup and reinitialization
- ✅ **Resource Management**: Proper cleanup prevents memory leaks
- ✅ **Error Handling**: Graceful degradation and user feedback
- ✅ **Multiple Devices**: Independent audio streams per device card

This implementation provides a robust, professional-grade audio streaming solution that integrates seamlessly with the Pearl Dashboard's real-time architecture.
