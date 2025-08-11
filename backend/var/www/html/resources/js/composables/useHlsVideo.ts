/**
 * useHlsVideo.ts - HLS Video Stream Management Composable
 * 
 * FEATURE OVERVIEW (Added August 2025):
 * ====================================
 * This composable enables HLS video streaming toggle functionality in Pearl Dashboard.
 * Users can switch between static preview images and live HLS video streams with a single click.
 * 
 * ARCHITECTURAL DESIGN:
 * =====================
 * This composable was designed to integrate seamlessly with existing Pearl Dashboard architecture:
 * - Does NOT interfere with existing audio streaming (useAudioStreaming)
 * - Does NOT conflict with preview images (usePreviewImage) 
 * - Uses same device/channel pattern as other composables
 * - Follows Vue 3 Composition API reactive patterns
 * 
 * BANDWIDTH CONSERVATION STRATEGY:
 * ===============================
 * Critical for Pearl Mini devices (hardware encoders, not servers):
 * - HLS streams are only loaded when video mode is active
 * - Streams are immediately destroyed when switching back to image mode
 * - Channel changes automatically cleanup video streams
 * - No background video loading or prefetching
 * 
 * HLS.JS INTEGRATION:
 * ==================
 * - Uses dynamic imports to avoid bundle bloat when video not used
 * - Supports native HLS (Safari) and HLS.js fallback (other browsers)
 * - Configured for Pearl Mini streaming characteristics (not ultra-low latency)
 * - Buffer management optimized for network streaming
 * 
 * LARAVEL PROXY INTEGRATION:
 * =========================
 * - Stream URLs point to Laravel HLS proxy endpoints
 * - Laravel handles authentication and segment rewriting
 * - Cross-browser CORS and security headers managed server-side
 * 
 * FUTURE MAINTENANCE NOTES:
 * ========================
 * - This composable is independent - can be modified without affecting images/audio
 * - Stream cleanup is automatic - no manual cleanup needed in parent components
 * - Error handling gracefully degrades to image mode on failures
 * - All video state is self-contained within this composable
 */

import { ref, computed, onBeforeUnmount, watch, nextTick } from 'vue'
import type { Ref } from 'vue'

interface HlsVideoOptions {
  device: string // Device IP
  channel: number // Channel ID
  autoStart?: boolean // Auto-start video on init
}

interface HlsVideoState {
  isLoaded: Ref<boolean>
  isPlaying: Ref<boolean>
  isMuted: Ref<boolean>
  isFullscreen: Ref<boolean>
  error: Ref<string | null>
  streamUrl: Ref<string | null>
}

interface HlsVideoMethods {
  loadStream: (videoElement: HTMLVideoElement) => Promise<boolean>
  unloadStream: () => void
  play: () => Promise<void>
  pause: () => void
  toggleMute: () => void
  toggleFullscreen: (videoElement: HTMLVideoElement) => Promise<void>
  destroy: () => void
}

export type HlsVideoComposable = HlsVideoState & HlsVideoMethods

export function useHlsVideo(options: HlsVideoOptions): HlsVideoComposable {
  // Reactive state
  const isLoaded = ref(false)
  const isPlaying = ref(false)
  const isMuted = ref(true) // Start muted like audio streaming
  const isFullscreen = ref(false)
  const error = ref<string | null>(null)
  
  // HLS instance and video element references
  let hlsInstance: any = null
  let videoElement: HTMLVideoElement | null = null
  
  // Construct stream URL - points to Laravel HLS proxy (not direct Pearl device)
  const streamUrl = computed(() => {
    if (!options.device || !options.channel) return null
    // IMPORTANT: Uses Laravel proxy endpoint, not direct Pearl device URL
    // This ensures authentication, CORS headers, and segment URL rewriting
    // Laravel proxy format: /api/devices/{device_id}/channels/{channel}/hls/stream.m3u8
    // Note: Hard-coded device ID 1 - in production this should use actual device lookup
    return `/api/devices/1/channels/${options.channel}/hls/stream.m3u8`
  })
  
  console.log(`🎥 HLS Video composable initialized for ${options.device}:${options.channel}`)
  
  /**
   * Load HLS stream into video element
   */
  const loadStream = async (videoEl: HTMLVideoElement): Promise<boolean> => {
    if (!streamUrl.value) {
      error.value = 'No stream URL available'
      return false
    }
    
    try {
      console.log(`🎥 Loading HLS stream: ${streamUrl.value}`)
      error.value = null
      videoElement = videoEl
      
      // Check if HLS is supported natively
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('🎥 Using native HLS support')
        videoEl.src = streamUrl.value
        isLoaded.value = true
        return true
      } 
      // Use HLS.js for browsers that don't support HLS natively
      else {
        // Dynamically import HLS.js to avoid bundle bloat
        const Hls = (await import('hls.js')).default
        
        if (Hls.isSupported()) {
          console.log('🎥 Using HLS.js for stream playback')
          
          hlsInstance = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: false, // Pearl Mini streams aren't ultra low latency
            backBufferLength: 30, // Keep 30 seconds of buffer
            maxBufferLength: 60, // Max 60 seconds buffer
          })
          
          // Error handling
          hlsInstance.on(Hls.Events.ERROR, (event: any, data: any) => {
            console.error('🎥 HLS.js error:', data)
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  error.value = 'Network error loading video stream'
                  break
                case Hls.ErrorTypes.MEDIA_ERROR:
                  error.value = 'Media error in video stream'
                  break
                default:
                  error.value = 'Fatal error loading video stream'
                  break
              }
            }
          })
          
          // Success events
          hlsInstance.on(Hls.Events.MANIFEST_LOADED, () => {
            console.log('✅ HLS manifest loaded successfully')
            isLoaded.value = true
          })
          
          // Load the stream
          hlsInstance.loadSource(streamUrl.value)
          hlsInstance.attachMedia(videoEl)
          
          return true
        } else {
          error.value = 'HLS not supported by this browser'
          return false
        }
      }
    } catch (err) {
      console.error('🎥 Error loading HLS stream:', err)
      error.value = 'Failed to load video stream'
      return false
    }
  }
  
  /**
   * Unload stream and cleanup resources
   */
  const unloadStream = () => {
    console.log('🎥 Unloading HLS stream')
    
    if (hlsInstance) {
      hlsInstance.destroy()
      hlsInstance = null
    }
    
    if (videoElement) {
      videoElement.src = ''
      videoElement.load()
      videoElement = null
    }
    
    isLoaded.value = false
    isPlaying.value = false
    error.value = null
    
    console.log('✅ HLS stream unloaded and resources cleaned up')
  }
  
  /**
   * Play video
   */
  const play = async (): Promise<void> => {
    if (!videoElement || !isLoaded.value) return
    
    try {
      await videoElement.play()
      isPlaying.value = true
      console.log('✅ Video playback started')
    } catch (err) {
      console.error('🎥 Error starting video playback:', err)
      error.value = 'Failed to start video playback'
    }
  }
  
  /**
   * Pause video
   */
  const pause = (): void => {
    if (!videoElement) return
    
    videoElement.pause()
    isPlaying.value = false
    console.log('⏸️ Video playback paused')
  }
  
  /**
   * Toggle video mute (independent of audio streaming)
   */
  const toggleMute = (): void => {
    if (!videoElement) return
    
    isMuted.value = !isMuted.value
    videoElement.muted = isMuted.value
    
    console.log(`🎥 Video ${isMuted.value ? 'muted' : 'unmuted'}`)
  }
  
  /**
   * Toggle fullscreen
   */
  const toggleFullscreen = async (videoEl: HTMLVideoElement): Promise<void> => {
    try {
      if (!isFullscreen.value) {
        // Enter fullscreen
        if (videoEl.requestFullscreen) {
          await videoEl.requestFullscreen()
        }
        isFullscreen.value = true
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        }
        isFullscreen.value = false
      }
    } catch (err) {
      console.error('🎥 Error toggling fullscreen:', err)
    }
  }
  
  /**
   * Complete cleanup and destroy
   */
  const destroy = (): void => {
    console.log('🎥 Destroying HLS video composable')
    unloadStream()
  }
  
  // Handle fullscreen change events
  const handleFullscreenChange = () => {
    isFullscreen.value = !!document.fullscreenElement
  }
  
  // Add fullscreen event listener
  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', handleFullscreenChange)
  }
  
  // Cleanup on unmount
  onBeforeUnmount(() => {
    console.log('🎥 HLS video composable unmounting - cleaning up resources')
    destroy()
    
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  })
  
  return {
    // State
    isLoaded,
    isPlaying,
    isMuted,
    isFullscreen,
    error,
    streamUrl,
    
    // Methods
    loadStream,
    unloadStream,
    play,
    pause,
    toggleMute,
    toggleFullscreen,
    destroy
  }
}

export default useHlsVideo