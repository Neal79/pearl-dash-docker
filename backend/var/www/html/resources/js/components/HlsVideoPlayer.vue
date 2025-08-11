<!--
  HlsVideoPlayer.vue - HLS Video Streaming Component
  
  FEATURE IMPLEMENTATION (Added August 2025):
  ===========================================
  This component provides seamless HLS video streaming as a toggle alternative to static preview images.
  
  USER EXPERIENCE DESIGN:
  =======================
  The component was designed to feel like a natural extension of the preview system:
  - Maintains exact same 16:9 aspect ratio as preview images
  - Uses native HTML5 video controls (familiar user experience)
  - Compact toggle button stays always visible (no disappearing overlays)
  - One-click switch back to image mode
  
  ARCHITECTURE INTEGRATION:
  =========================
  - Drop-in replacement for image display within PreviewTab's existing layout
  - Emits events back to parent components following existing patterns
  - Self-contained video lifecycle management (no external cleanup needed)
  - Uses useHlsVideo composable for all streaming logic
  
  SIMPLIFIED CONTROL DESIGN (Key UX Decision):
  ===========================================
  Original design had overlay controls (play/pause, mute, fullscreen) that would disappear on mouse movement.
  This created poor UX, so simplified to:
  - Native HTML5 video controls (users get familiar browser controls)
  - Single compact toggle button (always visible, lower right corner)
  - No complex overlay states or visibility management
  
  BANDWIDTH CONSERVATION:
  ======================
  - Video streams are loaded only when component mounts
  - Streams are immediately destroyed on component unmount
  - No preloading or background streaming
  - Component unmounts automatically when switching back to image mode
  
  RESPONSIVE DESIGN:
  ==================
  - Toggle button scales down on mobile devices
  - Video maintains aspect ratio on all screen sizes
  - Touch-friendly button sizing for mobile users
-->
<template>
  <div class="hls-video-container">
    <!-- Video Element with aspect ratio matching images -->
    <div class="video-wrapper">
      <video
        ref="videoRef"
        class="hls-video"
        :muted="isMuted"
        preload="auto"
        controls
        playsinline
        crossorigin="anonymous"
        x-webkit-airplay="allow"
        webkit-playsinline
        @loadstart="onLoadStart"
        @loadedmetadata="onLoadedMetadata" 
        @canplay="onCanPlay"
        @play="onPlay"
        @pause="onPause"
        @error="onError"
        @waiting="onWaiting"
        @canplaythrough="onCanPlayThrough"
      >
        Your browser does not support HLS video streaming.
      </video>
      
      <!-- Loading Overlay with Retry Status -->
      <Transition name="fade-overlay">
        <div v-if="!isLoaded || loading" class="loading-overlay">
          <div class="text-center">
            <v-progress-circular 
              indeterminate 
              color="primary" 
              size="32"
              class="mb-2"
            />
            <div class="text-body-2 text-white mb-2">
              Loading video stream...
            </div>
            <div class="text-caption text-white opacity-80">
              Waiting for HLS segments to be available
            </div>
          </div>
        </div>
      </Transition>
      
      <!-- Error Overlay -->
      <Transition name="fade-overlay">
        <div v-if="error" class="error-overlay">
          <div class="text-center">
            <v-icon size="32" color="error" class="mb-2">
              mdi-alert-circle-outline
            </v-icon>
            <div class="text-body-2 text-white mb-2">
              Video Error
            </div>
            <div class="text-caption text-white">
              {{ error }}
            </div>
          </div>
        </div>
      </Transition>
      
      <!-- Simple Toggle Button (Always Visible, Lower Right) -->
      <div class="toggle-button-overlay">
        <v-btn
          icon="mdi-image"
          size="x-small"
          color="white"
          variant="elevated"
          class="compact-toggle-button"
          @click="exitVideoMode"
          title="Switch back to image preview"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useHlsVideo } from '../composables/useHlsVideo'

interface Props {
  device: string // Device IP  
  channel: number // Channel ID
  autoPlay?: boolean // Auto-play when loaded
}

const props = withDefaults(defineProps<Props>(), {
  autoPlay: false
})

const emit = defineEmits<{
  'exit-video-mode': []
  'video-error': [error: string]
  'video-loaded': []
}>()

// Component refs
const videoRef = ref<HTMLVideoElement | null>(null)
const loading = ref(true)

// Initialize HLS video composable
const {
  isLoaded,
  isPlaying,
  isMuted,
  isFullscreen,
  error,
  streamUrl,
  loadStream,
  unloadStream,
  play,
  pause,
  toggleMute: hlsToggleMute,
  toggleFullscreen: hlsToggleFullscreen,
  destroy
} = useHlsVideo({
  device: props.device,
  channel: props.channel,
  autoStart: false
})

console.log(`🎥 HlsVideoPlayer mounted for ${props.device}:${props.channel}`)

// Video event handlers
const onLoadStart = () => {
  console.log('🎥 Video load started')
  loading.value = true
}

const onLoadedMetadata = () => {
  console.log('🎥 Video metadata loaded')
}

const onCanPlay = () => {
  console.log('🎥 Video can play')
  loading.value = false
  emit('video-loaded')
  
  // Auto-play if requested
  if (props.autoPlay) {
    nextTick(() => {
      play()
    })
  }
}

const onPlay = () => {
  console.log('🎥 Video started playing')
}

const onPause = () => {
  console.log('🎥 Video paused')
}

const onError = (event: Event) => {
  const videoEl = event.target as HTMLVideoElement
  const errorCode = videoEl.error?.code
  const errorMessage = videoEl.error?.message || 'Unknown video error'
  
  console.error('🎥 Video error:', errorCode, errorMessage)
  emit('video-error', errorMessage)
}

const onWaiting = () => {
  console.log('⏳ Video waiting for data - buffering...')
  loading.value = true
}

const onCanPlayThrough = () => {
  console.log('✅ Video can play through without stopping')
  loading.value = false
}

const exitVideoMode = () => {
  console.log('🎥 Exiting video mode')
  emit('exit-video-mode')
}

// Initialize video stream
onMounted(async () => {
  console.log('🎥 HlsVideoPlayer component mounted')
  
  await nextTick()
  
  if (videoRef.value && streamUrl.value) {
    console.log(`🎥 Loading HLS stream: ${streamUrl.value}`)
    
    try {
      const success = await loadStream(videoRef.value)
      if (!success) {
        console.error('🎥 Failed to load HLS stream')
        emit('video-error', error.value || 'Failed to load video stream')
      }
    } catch (err) {
      console.error('🎥 Error in video initialization:', err)
      emit('video-error', 'Video initialization failed')
    }
  } else {
    console.warn('🎥 No video element or stream URL available')
    emit('video-error', 'No video stream available')
  }
})

// Cleanup on unmount
onBeforeUnmount(() => {
  console.log('🎥 HlsVideoPlayer unmounting - cleaning up')
  unloadStream()
})
</script>

<style scoped>
.hls-video-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.hls-video {
  width: 100%;
  height: 100%;
  object-fit: contain; /* Maintain video aspect ratio */
  background: #000;
  cursor: pointer;
}

/* Overlay Styles */
.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

/* Compact Toggle Button (Always Visible, Lower Right) */
.toggle-button-overlay {
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 10;
}

.compact-toggle-button {
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  opacity: 0.9;
}

.compact-toggle-button:hover {
  opacity: 1;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* Transitions */
.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}


/* Mobile responsive */
@media (max-width: 767px) {
  .toggle-button-overlay {
    bottom: 6px;
    right: 6px;
  }
  
  .compact-toggle-button {
    transform: scale(0.9);
  }
}

/* Focus styles for accessibility */
.compact-toggle-button:focus {
  outline: 2px solid rgba(255, 255, 255, 0.8);
  outline-offset: 2px;
}
</style>