<!--
  PreviewTab.vue - Extracted Preview Management Component
  
  COMPONENT EXTRACTION - PREVIEW TAB (MOST COMPLEX):
  =================================================
  
  This component represents the most sophisticated extraction from PearlDeviceCard.vue,
  involving complex real-time state management, audio streaming, image handling,
  and control system integration.
  
  COMPLEXITY FACTORS:
  - Real-time image updates with seamless loading
  - Audio streaming with Web Audio API integration
  - Streaming/recording control system
  - User feedback overlay system
  - Multiple status indicators with real-time updates
  - Complex reactive state coordination
  
  CRITICAL ARCHITECTURAL PATTERNS:
  - Reactive props with toRefs() for real-time data flow
  - Audio streaming lifecycle management (subscription/cleanup)
  - Image loading with refresh intervals and error handling
  - Floating user message system (layout stable)
  - Control button state synchronization
  
  FUTURE ENHANCEMENTS:
  - Additional video streaming controls
  - Recording quality settings
  - Advanced audio processing
  - Streaming analytics
-->
<template>
  <div class="preview-container pa-3">
    <div v-if="selectedChannel">
      <!-- Preview and Audio Meter Layout -->
      <div class="d-flex ga-2 mb-4">
        <!-- 16:9 Preview Area -->
        <div class="preview-wrapper flex-grow-1">
          <div class="aspect-ratio-container">
            <div class="preview-content">
              <!-- HLS Video Player -->
              <div v-if="isVideoMode && selectedChannel" class="video-container">
                <HlsVideoPlayer
                  :device="device.ip"
                  :channel="parseInt(selectedChannel)"
                  :auto-play="true"
                  @exit-video-mode="handleToggleVideoMode"
                  @video-error="(error) => emit('user-message', error, 'error')"
                  @video-loaded="() => emit('user-message', 'Video stream loaded', 'success', 2000)"
                />
              </div>
              
              <!-- Still Image (Default Mode) -->
              <template v-else>
                <!-- Still Image -->
                <div class="image-container">
                  <img 
                    v-if="currentDisplayUrl && !previewError"
                    :src="currentDisplayUrl" 
                    :alt="`${device.name || device.ip} Channel ${selectedChannel}`"
                    class="w-100 h-100"
                    style="object-fit: cover;"
                    @error="onImageError"
                  />
                  
                  <!-- Video Mode Toggle Button (Lower Right Corner) -->
                  <div 
                    v-if="currentDisplayUrl && !previewError && selectedChannel"
                    class="video-toggle-overlay"
                  >
                    <v-btn
                      icon="mdi-play-circle-outline"
                      size="x-small"
                      color="white"
                      variant="elevated"
                      class="video-toggle-button"
                      :disabled="isVideoToggleDisabled"
                      @click="handleToggleVideoMode"
                      :title="isVideoToggleDisabled ? 'Please wait - channel loading...' : 'Switch to video stream'"
                    />
                  </div>
                </div>
                
                <!-- CRITICAL ERROR STATE for Live Monitoring -->
                <div 
                  v-if="previewError"
                  class="d-flex align-center justify-center h-100 preview-error-state"
                >
                  <div class="text-center">
                    <v-icon size="48" color="error" class="mb-3">
                      mdi-alert-circle-outline
                    </v-icon>
                    <div class="text-h6 text-error mb-2">
                      Preview Error
                    </div>
                    <div class="text-body-2 text-medium-emphasis mb-3">
                      {{ previewError }}
                    </div>
                    <div class="text-caption text-disabled">
                      Device {{ device.name || device.ip }} • Channel {{ selectedChannel }}
                    </div>
                  </div>
                </div>
                
                <!-- Loading placeholder -->
                <div 
                  v-if="!currentDisplayUrl && !previewError"
                  class="d-flex align-center justify-center h-100"
                >
                  <div class="text-center">
                    <v-progress-circular 
                      indeterminate 
                      color="primary" 
                      class="mb-2"
                    />
                    <div class="text-body-2 text-medium-emphasis">
                      Loading preview...
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
        
        <!-- Audio Meter -->
        <div class="audio-meter-wrapper d-flex align-center">
          <AudioMeter 
            :device="device.ip" 
            :channel="selectedChannel"
          />
        </div>
      </div>
      
      <!-- Streaming/Recording Controls -->
      <div class="controls-section">
        <v-divider class="mb-1" />
        
        <!-- 
          FLOATING USER MESSAGE OVERLAY
          =============================
          CRITICAL: This overlay MUST maintain layout stability
          - Uses absolute positioning to float over controls
          - Never moves or shifts buttons/content
          - Auto-dismisses after 3 seconds
          - Smooth Vue transitions for professional UX
        -->
        <Transition name="fade-message" appear>
          <div v-if="userMessage" class="user-message-overlay">
            <v-alert
              :type="userMessageType"
              variant="tonal"
              density="compact"
              :text="userMessage"
              closable
              @click:close="clearUserMessage"
            />
          </div>
        </Transition>
        
        <div class="d-flex align-center justify-space-between py-1">
          <!-- Status Indicators -->
          <div class="d-flex align-center ga-3">
            <!-- Connection Status -->
            <div class="d-flex align-center ga-1">
              <v-icon 
                :color="connectionStatus === 'connected' ? 'success' : 
                        connectionStatus === 'connecting' ? 'warning' : 'error'"
                size="14"
              >
                mdi-circle
              </v-icon>
              <span class="text-caption">
                {{ connectionStatus === 'connected' ? 'Connected' : 
                   connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected' }}
              </span>
            </div>
            
            <!-- 
              STREAMING STATUS INDICATOR
              =========================
              Color Logic (CRITICAL - maintain this exact logic):
              - Green: ALL publishers streaming (success state)
              - Red: Has publishers but ANY stopped (error - capability exists but not used)
              - Orange: ANY publisher transitioning (warning - in progress)
              - Gray: No publishers available (neutral - no capability)
            -->
            <div class="d-flex align-center ga-1">
              <v-icon 
                :color="streamingStatus.active ? 'success' : 
                        streamingStatus.state === 'starting' || streamingStatus.state === 'stopping' ? 'warning' : 
                        streamingStatus.hasPublishers ? 'error' : 'grey'"
                size="18"
              >
                {{ streamingStatus.active ? 'mdi-broadcast' : 
                   streamingStatus.state === 'starting' ? 'mdi-loading mdi-spin' :
                   streamingStatus.state === 'stopping' ? 'mdi-loading mdi-spin' : 'mdi-broadcast-off' }}
              </v-icon>
              <span class="text-caption" :class="{
                'text-success': streamingStatus.active,
                'text-warning': streamingStatus.state === 'starting' || streamingStatus.state === 'stopping',
                'text-error': !streamingStatus.active && streamingStatus.state === 'stopped' && streamingStatus.hasPublishers,
                'text-medium-emphasis': !streamingStatus.active && streamingStatus.state === 'stopped' && !streamingStatus.hasPublishers
              }">
                {{ streamingStatus.state === 'starting' ? 'Starting...' :
                   streamingStatus.state === 'stopping' ? 'Stopping...' :
                   streamingStatus.active ? 'Streaming' : 'Offline' }}
              </span>
            </div>
            
            <!-- Recording Status -->
            <div class="d-flex align-center ga-1">
              <v-icon 
                :color="recordingStatus.active ? 'error' : 'grey'"
                size="18"
              >
                {{ recordingStatus.active ? 'mdi-record-rec' : 'mdi-record' }}
              </v-icon>
              <span class="text-caption" :class="recordingStatus.active ? 'text-error' : 'text-medium-emphasis'">
                {{ recordingStatus.active ? 'Recording' : 'Stopped' }}
              </span>
            </div>
          </div>
          
          <!-- Control Buttons -->
          <div class="d-flex ga-1">
            <!-- 
              STREAMING CONTROL BUTTON
              ========================
              Button behavior for future reference:
              - Green when stopped (ready to start)
              - Red when streaming (ready to stop)
              - Disabled during transitions
              - Shows spinner during API calls
              - Provides user feedback via floating overlay (not layout-shifting alerts)
            -->
            <v-btn
              :color="streamingStatus.active ? 'error' : 'success'"
              :icon="isControlling ? 'mdi-loading mdi-spin' : 
                     streamingStatus.active ? 'mdi-stop' : 'mdi-play'"
              size="small"
              variant="tonal"
              :loading="isControlling"
              :disabled="isControlling || streamingStatus.state === 'starting' || streamingStatus.state === 'stopping'"
              @click="handleToggleStreaming"
            />
            
            <!-- Start/Stop Recording -->
            <v-btn
              :color="recordingStatus.active ? 'error' : 'error'"
              :icon="recordingStatus.active ? 'mdi-stop' : 'mdi-record'"
              size="small"
              variant="tonal"
              @click="handleToggleRecording"
            />
            
            <!-- Audio Mute/Unmute Button -->
            <v-btn
              :color="isAudioMuted ? 'grey' : 'primary'"
              :icon="isAudioMuted ? 'mdi-volume-off' : 'mdi-volume-high'"
              size="small"
              variant="tonal"
              :disabled="!canToggleAudio"
              @click="handleToggleAudioMute"
              :title="!canToggleAudio ? 'Select a channel to enable audio' : 
                      isAudioMuted ? 'Click to unmute and start audio streaming' : 'Click to mute audio'"
            />
          </div>
        </div>
      </div>
    </div>
    
    <!-- No Channel Selected -->
    <div v-else>
      <!-- Preview and Audio Meter Layout with Placeholder -->
      <div class="d-flex ga-2 mb-4">
        <!-- 16:9 Placeholder Area -->
        <div class="preview-wrapper flex-grow-1">
          <div class="aspect-ratio-container aspect-ratio-placeholder">
            <div class="preview-content d-flex align-center justify-center">
              <div class="text-center">
                <v-icon size="64" color="grey-lighten-1" class="mb-3">
                  mdi-video-outline
                </v-icon>
                <div class="text-h6 text-medium-emphasis mb-2">
                  {{ device.name || device.ip }}
                </div>
                <div class="text-body-2 text-medium-emphasis">
                  Select a channel to view preview
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Audio Meter Placeholder -->
        <div class="audio-meter-wrapper d-flex align-center justify-center">
          <div class="audio-meter-placeholder">
            <v-icon color="grey-lighten-1" size="24">
              mdi-volume-off
            </v-icon>
          </div>
        </div>
      </div>
      
      <!-- Controls Section (Disabled State) -->
      <div class="controls-section">
        <v-divider class="mb-2" />
        
        <div class="d-flex align-center justify-space-between py-1">
          <!-- Status Indicators (Disabled) -->
          <div class="d-flex align-center ga-3">
            <!-- Connection Status -->
            <div class="d-flex align-center ga-1">
              <v-icon color="grey" size="14">
                mdi-circle
              </v-icon>
              <span class="text-caption text-medium-emphasis">
                No Channel
              </span>
            </div>
            
            <!-- Streaming Status (Disabled) -->
            <div class="d-flex align-center ga-1">
              <v-icon color="grey" size="18">
                mdi-broadcast-off
              </v-icon>
              <span class="text-caption text-medium-emphasis">
                Offline
              </span>
            </div>
            
            <!-- Recording Status (Disabled) -->
            <div class="d-flex align-center ga-1">
              <v-icon color="grey" size="18">
                mdi-record
              </v-icon>
              <span class="text-caption text-medium-emphasis">
                Stopped
              </span>
            </div>
          </div>
          
          <!-- Control Buttons (Disabled) -->
          <div class="d-flex ga-1">
            <v-btn
              icon="mdi-play"
              size="small"
              variant="tonal"
              color="grey"
              disabled
            />
            <v-btn
              icon="mdi-record"
              size="small"
              variant="tonal"
              color="grey"
              disabled
            />
            
            <!-- Audio Mute Button (Disabled) -->
            <v-btn
              icon="mdi-volume-off"
              size="small"
              variant="tonal"
              color="grey"
              disabled
              title="Select a channel to enable audio"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
  PREVIEWTAB COMPONENT ARCHITECTURE - MOST COMPLEX EXTRACTION
  ===========================================================
  
  This component demonstrates the ultimate complexity in component extraction,
  managing multiple real-time systems simultaneously:
  
  1. IMAGE MANAGEMENT SYSTEM:
     - Real-time image updates with refresh intervals
     - Seamless loading with error handling
     - Responsive image display with aspect ratio preservation
  
  2. AUDIO STREAMING SYSTEM:
     - Web Audio API integration
     - Audio streaming lifecycle management
     - Mute/unmute state coordination
     - Audio context handling
  
  3. CONTROL SYSTEM INTEGRATION:
     - Streaming control with real-time status
     - Recording control integration
     - Button state synchronization
     - Loading and disabled states
  
  4. USER FEEDBACK SYSTEM:
     - Floating overlay messages
     - Auto-dismiss functionality
     - Layout stability maintenance
  
  5. REAL-TIME STATUS DISPLAY:
     - Connection status monitoring
     - Streaming status with color coding
     - Recording status indication
     - Multi-state status management
  
  REACTIVE PROPS PATTERN (CRITICAL):
  All props converted to reactive refs using toRefs() to ensure
  real-time updates from parent component trigger UI changes.
  
  LIFECYCLE MANAGEMENT:
  - Image refresh intervals
  - Audio streaming cleanup
  - User message timers
  - State synchronization
*/

import { ref, computed, watch, onMounted, onBeforeUnmount, toRefs } from 'vue'
import AudioMeter from './AudioMeter.vue'
import HlsVideoPlayer from './HlsVideoPlayer.vue'

interface Device {
  id: number
  name?: string
  ip: string
}

interface StreamingStatus {
  active: boolean
  state: 'stopped' | 'starting' | 'started' | 'stopping'
  hasPublishers: boolean
}

interface RecordingStatus {
  active: boolean
}

interface Props {
  device: Device
  selectedChannel: string | ''
  connectionStatus: string
  streamingStatus: StreamingStatus
  recordingStatus: RecordingStatus
  isControlling: boolean
  isAudioMuted: boolean
  canToggleAudio: boolean
  currentDisplayUrl: string
  userMessage: string | null
  userMessageType: 'success' | 'error' | 'info'
  previewError: string | null
  isVideoMode?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'toggle-streaming': []
  'toggle-recording': []
  'toggle-audio-mute': []
  'image-error': []
  'user-message-clear': []
  'user-message': [message: string, type: 'success' | 'error' | 'info', duration?: number]
  'toggle-video-mode': []
}>()

// Make props reactive for proper real-time updates
const { 
  device,
  selectedChannel, 
  connectionStatus,
  streamingStatus,
  recordingStatus,
  isControlling,
  isAudioMuted,
  canToggleAudio,
  currentDisplayUrl,
  userMessage,
  userMessageType,
  previewError,
  isVideoMode
} = toRefs(props)

// VIDEO TOGGLE RACE CONDITION PREVENTION (January 2025)
// =====================================================
// Prevents "touchy" behavior when users rapidly switch channels by disabling
// the video toggle button for 3 seconds after channel changes. This allows
// HLS segments to be properly generated before allowing video mode activation.
//
// PROBLEM SOLVED:
// - Users clicking video toggle too quickly after channel changes
// - HLS segments not yet available causing errors
// - Race conditions between channel switching and video loading
//
// SOLUTION:
// - 3-second disabled state with visual feedback (grayed out, different tooltip)
// - Automatic timer cleanup on component unmount
// - Timer reset on rapid channel changes (restart 3-second countdown)
//
const isVideoToggleDisabled = ref(false)
let disableTimer: NodeJS.Timeout | null = null

// Watch for channel changes and temporarily disable video toggle
watch(selectedChannel, (newChannel, oldChannel) => {
  if (oldChannel && newChannel !== oldChannel) {
    console.log(`🎥 Channel changed from ${oldChannel} to ${newChannel} - disabling video toggle for 3 seconds`)
    
    // Disable the video toggle button with visual feedback
    isVideoToggleDisabled.value = true
    
    // Clear any existing timer (handles rapid channel switching)
    if (disableTimer) {
      clearTimeout(disableTimer)
    }
    
    // Re-enable after 3 seconds (allows HLS segments to generate)
    disableTimer = setTimeout(() => {
      isVideoToggleDisabled.value = false
      disableTimer = null
      console.log('✅ Video toggle re-enabled after channel change delay')
    }, 3000)
  }
}, { immediate: false })

// Event handlers that emit to parent
const handleToggleStreaming = () => {
  emit('toggle-streaming')
}

const handleToggleRecording = () => {
  emit('toggle-recording')
}

const handleToggleAudioMute = () => {
  emit('toggle-audio-mute')
}

const onImageError = () => {
  emit('image-error')
}

const clearUserMessage = () => {
  emit('user-message-clear')
}

const handleToggleVideoMode = () => {
  emit('toggle-video-mode')
}

// Component lifecycle
onMounted(() => {
  console.log(`🖼️ PreviewTab mounted for device ${device.value.id} (${device.value.name || device.value.ip})`)
})

onBeforeUnmount(() => {
  console.log(`🖼️ PreviewTab unmounting for device ${device.value.id}`)
  
  // Clean up disable timer
  if (disableTimer) {
    clearTimeout(disableTimer)
    disableTimer = null
  }
})
</script>

<style scoped>
/* Preview container styling */
.preview-container {
  min-height: 300px;
}

/* 16:9 Aspect Ratio Container */
.aspect-ratio-container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 aspect ratio - NEVER changes */
  overflow: hidden;
  border-radius: 8px;
  background: rgb(var(--v-theme-surface-variant));
}

.aspect-ratio-placeholder {
  border: 2px dashed rgb(var(--v-theme-outline-variant));
}

.preview-wrapper {
  flex: 1 1 0%;
  min-width: 280px;
  max-width: 100%;
}

.preview-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.preview-content img {
  width: 100%;
  height: 100%;
  object-fit: contain; /* Maintain image aspect ratio, letterbox if needed */
  display: block;
}

/* Container styling for image and video modes */
.image-container,
.video-container {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Video Toggle Button Overlay (Lower Right Corner) */
.video-toggle-overlay {
  position: absolute;
  bottom: 8px;
  right: 8px;
  z-index: 5;
}

.video-toggle-button {
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  opacity: 0.9;
}

.video-toggle-button:hover:not(:disabled) {
  opacity: 1;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.video-toggle-button:disabled {
  opacity: 0.4 !important;
  cursor: not-allowed !important;
  transform: none !important;
  filter: grayscale(0.8);
}

/* CRITICAL ERROR STATE styling for live monitoring */
.preview-error-state {
  background: rgba(var(--v-theme-error-container), 0.1);
  border: 2px solid rgba(var(--v-theme-error), 0.3);
  border-radius: 8px;
  padding: 2rem;
}

.audio-meter-wrapper {
  height: auto;
  align-self: stretch;
  flex-shrink: 0;
  width: 44px;
}

.audio-meter-placeholder {
  width: 100%;
  height: 100%;
  min-height: 120px;
  background: rgb(var(--v-theme-surface-variant));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed rgb(var(--v-theme-outline-variant));
}

.controls-section {
  margin-top: 0;
  padding-top: 0;
  position: relative; /* For absolute positioning of overlay */
}

/* 
  FLOATING MESSAGE OVERLAY SYSTEM
  ===============================
  CRITICAL: This pattern should be used for ALL user feedback in future components
  
  Key principles:
  - Absolute positioning prevents layout shifts
  - High z-index ensures visibility
  - Backdrop blur creates modern overlay effect
  - Theme-aware backgrounds maintain consistency
  - Smooth transitions enhance user experience
*/
.user-message-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  border-radius: 8px;
  padding: 8px;
}

.v-theme--dark .user-message-overlay {
  background: rgba(33, 33, 33, 0.95);
}

/* 
  ANIMATION TRANSITIONS
  ====================
  Standard timing for professional UX:
  - Enter: 0.3s ease-out (welcoming, gentle)
  - Leave: 0.2s ease-in (quick, unobtrusive)
  - Transform: Subtle slide for natural feel
*/
.fade-message-enter-active {
  transition: all 0.3s ease-out;
}

.fade-message-leave-active {
  transition: all 0.2s ease-in;
}

.fade-message-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-message-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

/* Theme-aware styling */
.v-theme--dark .aspect-ratio-container {
  background: rgb(var(--v-theme-surface-bright));
}

.v-theme--light .aspect-ratio-container {
  background: rgb(var(--v-theme-surface-container-lowest));
}

.v-theme--dark .audio-meter-placeholder {
  background: rgb(var(--v-theme-surface-bright));
}

.v-theme--light .audio-meter-placeholder {
  background: rgb(var(--v-theme-surface-container-lowest));
}

/* Spinning animation for loading icons */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mdi-spin {
  animation: spin 1s linear infinite;
}

/* Mobile responsive adjustments */
@media (max-width: 767px) {
  .preview-wrapper {
    min-width: 200px;
  }
  
  .audio-meter-wrapper {
    width: 36px;
  }
  
  .preview-container {
    min-height: 250px;
  }
  
  .video-toggle-overlay {
    bottom: 6px;
    right: 6px;
  }
  
  .video-toggle-button {
    transform: scale(0.9);
  }
}
</style>