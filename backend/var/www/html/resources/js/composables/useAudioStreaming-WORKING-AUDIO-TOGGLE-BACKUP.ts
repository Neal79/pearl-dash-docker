/**
 * Audio Streaming Composable
 * 
 * Provides real-time audio streaming from Pearl devices via WebSocket.
 * This composable creates its own WebSocket connection to the audio-meter-service
 * for audio streaming, separate from the meter data connection.
 */

import { ref, computed, onUnmounted } from 'vue'
import { useAuth } from './useAuth.js'

interface AudioStreamOptions {
  device: string
  channel: number
  autoStart?: boolean
}

interface AudioData {
  device: string
  channel: number
  data: string // base64 encoded PCM data
  format: {
    sampleRate: number
    channels: number
    bitsPerSample: number
    encoding: string
  }
  timestamp: number
}

export function useAudioStreaming(options: AudioStreamOptions) {
  const { device, channel, autoStart = false } = options
  const auth = useAuth()
  
  // State
  const isStreaming = ref(false)
  const isSubscribed = ref(false)
  const isConnected = ref(false)
  const isMuted = ref(true) // Track actual mute state
  const latestAudioData = ref<AudioData | null>(null)
  const audioContext = ref<AudioContext | null>(null)
  const sourceBuffer = ref<AudioBufferSourceNode | null>(null)
  const gainNode = ref<GainNode | null>(null) // For volume control
  
  // WebSocket connection
  let ws: WebSocket | null = null
  
  // Audio queue for smooth playback
  const audioQueue: Float32Array[] = []
  let nextPlayTime = 0
  
  // Computed
  const streamKey = computed(() => `${device}:${channel}`)
  const canPlay = computed(() => isConnected.value && isSubscribed.value && !!audioContext.value)
  
  // Initialize Web Audio API
  const initializeAudioContext = async () => {
    console.log('🎵 [AUDIO] Initializing audio context...')
    if (!audioContext.value) {
      try {
        audioContext.value = new AudioContext({
          sampleRate: 48000,
          latencyHint: 'interactive'
        })
        console.log('🎵 [AUDIO] Audio context created:', {
          sampleRate: audioContext.value.sampleRate,
          state: audioContext.value.state
        })
        
        // Create gain node for volume control
        gainNode.value = audioContext.value.createGain()
        gainNode.value.connect(audioContext.value.destination)
        gainNode.value.gain.value = isMuted.value ? 0 : 1
        console.log('🎵 [AUDIO] Gain node created with volume:', gainNode.value.gain.value)
        
      } catch (error) {
        console.error('❌ [AUDIO] Failed to create audio context:', error)
        return
      }
      
      // Resume audio context on user interaction (required by browsers)
      if (audioContext.value.state === 'suspended') {
        console.log('🎵 [AUDIO] Audio context suspended, attempting to resume...')
        try {
          await audioContext.value.resume()
          console.log('✅ [AUDIO] Audio context resumed successfully')
        } catch (error) {
          console.error('❌ [AUDIO] Failed to resume audio context:', error)
        }
      }
    } else {
      console.log('🎵 [AUDIO] Audio context already exists:', {
        sampleRate: audioContext.value.sampleRate,
        state: audioContext.value.state
      })
    }
  }
  
  // Convert base64 PCM data to AudioBuffer
  const processAudioData = async (audioData: AudioData) => {
    console.log('🎵 [AUDIO] Processing audio data:', {
      device: audioData.device,
      channel: audioData.channel,
      dataLength: audioData.data?.length || 0,
      format: audioData.format,
      timestamp: audioData.timestamp
    })
    
    if (!audioContext.value) {
      console.error('❌ [AUDIO] No audio context available for processing')
      return
    }
    
    try {
      // Decode base64 to binary
      console.log('🎵 [AUDIO] Decoding base64 data...')
      const binaryString = atob(audioData.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      console.log(`🎵 [AUDIO] Decoded ${bytes.length} bytes from base64`)
      
      // Convert s16le PCM to Float32Array
      const samples = new Float32Array(bytes.length / 2)
      const dataView = new DataView(bytes.buffer)
      
      for (let i = 0; i < samples.length; i++) {
        samples[i] = dataView.getInt16(i * 2, true) / 32768 // true = little endian
      }
      
      console.log(`🎵 [AUDIO] Converted to ${samples.length} audio samples`)
      console.log(`🎵 [AUDIO] Sample range: ${Math.min(...samples)} to ${Math.max(...samples)}`)
      
      // Add to audio queue for smooth playback
      audioQueue.push(samples)
      console.log(`🎵 [AUDIO] Added to queue. Queue length: ${audioQueue.length}`)
      
      // Start or continue playback
      if (!isStreaming.value) {
        console.log('🎵 [AUDIO] Starting audio playback...')
        isStreaming.value = true
        scheduleAudioPlayback()
      } else if (audioQueue.length === 1) {
        // If this is the only item in queue and we were streaming, 
        // the playback might have stopped waiting for more data
        console.log('🎵 [AUDIO] Queue was empty, resuming playback with new data')
        scheduleAudioPlayback()
      } else {
        console.log('🎵 [AUDIO] Audio already streaming, data queued')
      }
      
    } catch (error) {
      console.error('❌ [AUDIO] Error processing audio data:', error)
    }
  }
  
  // Schedule audio playback from queue
  const scheduleAudioPlayback = () => {
    console.log('🎵 [PLAYBACK] Attempting to schedule audio playback')
    console.log(`🎵 [PLAYBACK] Audio context: ${!!audioContext.value}, Queue length: ${audioQueue.length}`)
    
    if (!audioContext.value || audioQueue.length === 0) {
      console.log('⚠️ [PLAYBACK] Cannot schedule - no audio context or empty queue')
      return
    }
    
    const samples = audioQueue.shift()!
    const sampleRate = 48000
    const channels = 2
    const samplesPerChannel = samples.length / channels
    
    console.log(`🎵 [PLAYBACK] Creating audio buffer: ${channels} channels, ${samplesPerChannel} samples, ${sampleRate}Hz`)
    
    // Create AudioBuffer
    const audioBuffer = audioContext.value.createBuffer(
      channels,
      samplesPerChannel,
      sampleRate
    )
    
    // Fill buffer with interleaved stereo data
    const leftChannel = audioBuffer.getChannelData(0)
    const rightChannel = audioBuffer.getChannelData(1)
    
    for (let i = 0; i < samplesPerChannel; i++) {
      leftChannel[i] = samples[i * 2]     // Left channel
      rightChannel[i] = samples[i * 2 + 1] // Right channel
    }
    
    console.log(`🎵 [PLAYBACK] Audio buffer filled - duration: ${audioBuffer.duration}s`)
    
    // Create and configure source node
    const sourceNode = audioContext.value.createBufferSource()
    sourceNode.buffer = audioBuffer
    // Connect through gain node for volume control
    if (gainNode.value) {
      sourceNode.connect(gainNode.value)
    } else {
      sourceNode.connect(audioContext.value.destination)
    }
    
    // Initialize nextPlayTime if not set
    if (nextPlayTime === 0) {
      nextPlayTime = audioContext.value.currentTime
    }
    
    // Schedule playback - ensure continuous playback without gaps
    const playTime = Math.max(audioContext.value.currentTime, nextPlayTime)
    console.log(`🎵 [PLAYBACK] Scheduling playback at ${playTime}s (current: ${audioContext.value.currentTime}s)`)
    
    sourceNode.onended = () => {
      console.log('🎵 [PLAYBACK] Audio buffer finished playing')
      // Immediately try to schedule next buffer if available
      if (audioQueue.length > 0) {
        console.log('🎵 [PLAYBACK] Buffer ended, immediately scheduling next from queue')
        scheduleAudioPlayback()
      } else {
        console.log('🎵 [PLAYBACK] Buffer ended, queue empty - will resume when more data arrives')
      }
    }
    
    try {
      sourceNode.start(playTime)
      console.log('✅ [PLAYBACK] Audio source started successfully')
      
      // Update next play time for seamless continuity
      nextPlayTime = playTime + audioBuffer.duration
      console.log(`🎵 [PLAYBACK] Next play time set to: ${nextPlayTime}s`)
      
      // Proactively schedule next buffer if available (don't wait for onended)
      if (audioQueue.length > 0) {
        console.log(`🎵 [PLAYBACK] More audio in queue (${audioQueue.length} items), scheduling next immediately`)
        // Use a small timeout instead of requestAnimationFrame for more reliable timing
        setTimeout(() => scheduleAudioPlayback(), 10)
      } else {
        console.log('🎵 [PLAYBACK] Queue empty after scheduling current buffer')
      }
    } catch (error) {
      console.error('❌ [PLAYBACK] Failed to start audio source:', error)
    }
  }
  
  // Connect to WebSocket
  const connect = async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('🎵 [CONNECT] WebSocket already open')
      return true
    }
    
    try {
      const token = await auth.getValidToken()
      if (!token) {
        console.warn('🔒 [CONNECT] No authentication token available for audio streaming')
        return false
      }
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/audio-meter?token=${token}`
      
      console.log('🎵 [CONNECT] Creating WebSocket connection...')
      ws = new WebSocket(wsUrl)
      
      // Create a promise that resolves when connection is established
      return new Promise((resolve) => {
        let resolved = false
        
        const resolveOnce = (value: boolean) => {
          if (!resolved) {
            resolved = true
            resolve(value)
          }
        }
        
        ws!.onopen = () => {
          console.log('🎵 [CONNECT] Audio streaming WebSocket connected successfully')
          console.log(`🎵 [CONNECT] WebSocket readyState: ${ws?.readyState}`)
          isConnected.value = true
          resolveOnce(true)
        }
        
        ws!.onmessage = (event) => {
          console.log('🎵 Received WebSocket message:', event.data)
          try {
            const message = JSON.parse(event.data)
            console.log('🎵 Parsed message:', message)
            
            if (message.type === 'audio_data') {
              console.log(`🎵 Received audio_data for ${message.device}:${message.channel}`)
              console.log(`🎵 Looking for device: ${device}, channel: ${channel}`)
              
              if (message.device === device && message.channel === channel) {
                console.log('🎵 Audio data matches our subscription - processing')
                latestAudioData.value = message
                processAudioData(message)
              } else {
                console.log('🎵 Audio data does not match our subscription - ignoring')
              }
            } else if (message.type === 'audio_subscribed') {
              console.log(`🎵 Received audio_subscribed for ${message.device}:${message.channel}`)
              if (message.device === device && message.channel === channel) {
                isSubscribed.value = true
                console.log(`✅ Successfully subscribed to audio stream ${message.streamKey}`)
              }
            } else if (message.type === 'connected') {
              console.log('🎵 WebSocket connection confirmed:', message)
            } else if (message.type === 'error') {
              console.error('🎵 WebSocket error message:', message)
            } else {
              console.log('🎵 Other message type received:', message.type)
            }
          } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error)
            console.error('❌ Raw message data:', event.data)
          }
        }
        
        ws!.onclose = () => {
          console.log('🎵 [CONNECT] Audio streaming WebSocket disconnected')
          isConnected.value = false
          isSubscribed.value = false
          if (!resolved) {
            resolveOnce(false)
          }
        }
        
        ws!.onerror = (error) => {
          console.error('🎵 [CONNECT] Audio streaming WebSocket error:', error)
          isConnected.value = false
          if (!resolved) {
            resolveOnce(false)
          }
        }
        
        // Timeout after 10 seconds
        setTimeout(() => {
          if (!resolved) {
            console.error('🎵 [CONNECT] WebSocket connection timeout')
            resolveOnce(false)
          }
        }, 10000)
      })
    } catch (error) {
      console.error('❌ [CONNECT] Failed to connect audio streaming WebSocket:', error)
      return false
    }
  }
  
  // Subscribe to audio stream
  const subscribe = async () => {
    console.log(`🎵 [SUBSCRIBE] Attempting to subscribe to ${device}:${channel}`)
    console.log(`🎵 [SUBSCRIBE] Current state - Connected: ${isConnected.value}, Subscribed: ${isSubscribed.value}`)
    console.log(`🎵 [SUBSCRIBE] WebSocket state: ${ws?.readyState} (${ws?.readyState === WebSocket.OPEN ? 'OPEN' : 'NOT OPEN'})`)
    
    // Wait for connection if not connected
    if (!isConnected.value) {
      console.log('🎵 [SUBSCRIBE] Not connected, attempting to connect...')
      const connected = await connect()
      if (!connected) {
        console.error('❌ [SUBSCRIBE] Cannot subscribe - WebSocket not connected')
        return
      }
      
      // Wait a bit for the connection to be fully established
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    if (isSubscribed.value) {
      console.log('⚠️ [SUBSCRIBE] Already subscribed, skipping')
      return
    }
    
    console.log('🎵 [SUBSCRIBE] Initializing audio context...')
    await initializeAudioContext()
    
    // Double-check WebSocket is ready
    if (ws && ws.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        type: 'subscribe_audio',
        device,
        channel
      }
      console.log('🎵 [SUBSCRIBE] Sending subscription message:', subscribeMessage)
      ws.send(JSON.stringify(subscribeMessage))
      console.log('✅ [SUBSCRIBE] Subscription message sent successfully')
    } else {
      console.error('❌ [SUBSCRIBE] WebSocket not ready after connection attempt - state:', ws?.readyState)
      console.error('❌ [SUBSCRIBE] isConnected.value:', isConnected.value)
      console.error('❌ [SUBSCRIBE] ws exists:', !!ws)
    }
  }
  
  // Unsubscribe from audio stream
  const unsubscribe = () => {
    if (!isConnected.value || !isSubscribed.value) return
    
    // Send unsubscribe message
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'unsubscribe_audio',
        device,
        channel
      }))
    }
    
    isSubscribed.value = false
    isStreaming.value = false
    
    // Clear audio queue
    audioQueue.length = 0
    nextPlayTime = 0
    
    console.log(`🎵 Unsubscribed from audio stream ${streamKey.value}`)
  }
  
  // Disconnect WebSocket
  const disconnect = () => {
    if (ws) {
      ws.close()
      ws = null
    }
    isConnected.value = false
    isSubscribed.value = false
    isStreaming.value = false
  }
  
  // Start audio streaming (WebSocket subscription)
  const startStreaming = async () => {
    console.log('🎵 [STREAM] Starting audio streaming...')
    if (!canPlay.value) {
      console.log('🎵 [STREAM] Cannot play yet, subscribing first...')
      await subscribe()
    }
    // Don't set isStreaming here - it's set when audio data starts being processed
    // Automatically unmute when starting streaming
    isMuted.value = false
    setVolume(1)
    console.log('✅ [STREAM] Audio streaming subscription started and unmuted')
  }
  
  // Stop audio streaming (WebSocket unsubscription)
  const stopStreaming = () => {
    console.log('🎵 [STREAM] Stopping audio streaming...')
    isStreaming.value = false
    
    // Stop current audio source
    if (sourceBuffer.value) {
      sourceBuffer.value.stop()
      sourceBuffer.value = null
    }
    
    // Clear audio queue
    audioQueue.length = 0
    nextPlayTime = 0
    
    // Mute when stopping
    isMuted.value = true
    setVolume(0)
    console.log('✅ [STREAM] Audio streaming stopped and muted')
  }
  
  // Set volume level (0 = muted, 1 = full volume)
  const setVolume = (volume: number) => {
    if (gainNode.value && audioContext.value) {
      gainNode.value.gain.value = volume
      console.log(`🎵 [VOLUME] Volume set to: ${volume}, Audio context state: ${audioContext.value.state}`)
      
      // Ensure audio context is resumed
      if (audioContext.value.state === 'suspended') {
        console.log('🎵 [VOLUME] Audio context suspended, attempting to resume...')
        audioContext.value.resume().then(() => {
          console.log('✅ [VOLUME] Audio context resumed')
        }).catch(error => {
          console.error('❌ [VOLUME] Failed to resume audio context:', error)
        })
      }
    } else {
      console.warn('⚠️ [VOLUME] Cannot set volume - no gain node or audio context')
    }
  }
  
  // Mute audio (keep WebSocket connection)
  const mute = () => {
    console.log('🎵 [MUTE] Muting audio...')
    isMuted.value = true
    setVolume(0)
  }
  
  // Unmute audio (keep WebSocket connection)
  const unmute = () => {
    console.log('🎵 [MUTE] Unmuting audio...')
    isMuted.value = false
    setVolume(1)
  }
  
  // Toggle mute state (keep WebSocket connection)
  const toggleMute = () => {
    if (isMuted.value) {
      unmute()
    } else {
      mute()
    }
  }
  
  // Toggle streaming (old method - kept for compatibility)
  const toggleStreaming = async () => {
    if (isStreaming.value) {
      stopStreaming()
    } else {
      await startStreaming()
    }
  }
  
  // Auto-start if requested
  if (autoStart && isConnected.value) {
    startStreaming()
  }
  
  // Cleanup on unmount
  onUnmounted(() => {
    stopStreaming()
    unsubscribe()
    disconnect()
    
    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = null
    }
  })
  
  return {
    // State
    isStreaming: computed(() => isStreaming.value),
    isSubscribed: computed(() => isSubscribed.value),
    isMuted: computed(() => isMuted.value),
    canPlay,
    latestAudioData: computed(() => latestAudioData.value),
    streamKey,
    
    // Actions
    subscribe,
    unsubscribe,
    startStreaming,
    stopStreaming,
    toggleStreaming,
    
    // Volume control
    mute,
    unmute,
    toggleMute,
    setVolume,
    
    // Audio context info
    audioContext: computed(() => audioContext.value),
    sampleRate: computed(() => audioContext.value?.sampleRate || 48000),
    state: computed(() => audioContext.value?.state || 'suspended')
  }
}