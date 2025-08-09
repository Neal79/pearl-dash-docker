<template>
  <div class="flex flex-col items-center h-full w-10 bg-gray-900 rounded-lg relative overflow-hidden min-h-[120px] mx-auto">
    <!-- Meter container -->
    <div class="flex-1 w-6 bg-gray-800 rounded relative mt-2 mb-10">
      <!-- Peak hold indicator - now positioned relative to meter container -->
      <div 
        class="w-6 h-0.5 bg-red-400 absolute z-10 transition-all duration-100"
        :class="{ 'opacity-100': showPeakHold, 'opacity-0': !showPeakHold }"
        :style="{ bottom: peakHoldPosition + '%' }"
      ></div>
      <!-- Background gradient zones for reference -->
      <div class="absolute inset-0 rounded" style="background: linear-gradient(to top, 
        #16a34a 0%, 
        #16a34a 55%, 
        #eab308 55%, 
        #eab308 77.5%, 
        #dc2626 77.5%, 
        #dc2626 100%); opacity: 0.3;"></div>
      
      <!-- Actual level meter -->
      <div 
        class="absolute bottom-0 left-0 right-0 rounded-b"
        :style="{ 
          height: rmsPosition + '%',
          background: getMeterGradient(rmsPosition)
        }"
      ></div>
      
      <!-- PPM level indicator line -->
      <div 
        class="absolute left-0 right-0 h-0.5 bg-white shadow-lg z-10"
        :style="{ bottom: rmsPosition + '%' }"
      ></div>
      
      <!-- dB scale labels inside meter - positioned by percentage to match gradient zones -->
      <div class="absolute left-1/2 transform -translate-x-1/2 inset-0 z-20" style="text-shadow: 1px 1px 2px rgba(0,0,0,0.8)">
        <!-- 0dB slightly below top to stay in active section -->
        <span class="absolute text-[10px] text-white font-medium transform -translate-x-1/2 -translate-y-1/2" style="top: 5%; left: 50%;">0</span>
        <!-- -9dB at 77.5% (red/yellow boundary) -->
        <span class="absolute text-[10px] text-white font-medium transform -translate-x-1/2 -translate-y-1/2" style="top: 22.5%; left: 50%;">-9</span>
        <!-- -18dB at 55% (yellow/green boundary) -->
        <span class="absolute text-[10px] text-white font-medium transform -translate-x-1/2 -translate-y-1/2" style="top: 45%; left: 50%;">-18</span>
        <!-- -40dB slightly above bottom to stay in active section -->
        <span class="absolute text-[10px] text-white font-medium transform -translate-x-1/2 -translate-y-1/2" style="top: 95%; left: 50%;">-40</span>
      </div>
    </div>
    
    
    <!-- Peak hold numerical readout -->
    <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2 text-center pt-1">
      <div class="text-gray-300 font-mono text-[8px]">
        {{ currentPeakHold > -50 ? currentPeakHold.toFixed(1) : '--' }}
      </div>
    </div>

    <!-- Connection status -->
    <div class="absolute bottom-0.5 left-0 right-0 text-center">
      <div 
        class="w-1 h-1 rounded-full mx-auto mb-0.5"
        :class="getConnectionStatusClass()"
      ></div>
      <div class="text-gray-400 text-[9px]">
        {{ getConnectionStatusText() }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// @claude: protected logic, do not modify without CLAUDE.md review section
import { computed, ref, watch, onUnmounted } from 'vue'
import { useAudioMeterWebSocket } from '../composables/useAudioMeterWebSocket'

interface Props {
  device: string
  channel: number | string
}

const props = defineProps<Props>()

const { 
  connected, 
  connecting, 
  subscribe, 
  unsubscribe, 
  getMeterData 
} = useAudioMeterWebSocket()

// Meter data
const showPeakHold = ref(false)
const peakHoldPosition = ref(0)
const peakHoldTimeout = ref<any>(null)
const currentPeakHold = ref(-60) // Current peak hold value in dB
const peakHoldCaptureTime = ref<number>(0) // Track when peak was captured
const currentSubscription = ref<string | null>(null) // Track current subscription
const lastDataReceived = ref<number>(0) // Track when we last received data
const streamHealthTimer = ref<any>(null) // Timer to check stream health

// PPM meter state
const ppmPosition = ref(0)
const lastPpmUpdate = ref(0)
const ppmTick = ref(0) // Force reactivity for PPM updates
let ppmTimer: any = null

// PPM timing constants (per IEC 60268-10)
const PPM_ATTACK_TIME = 10   // 10ms attack time
const PPM_DECAY_TIME = 1700  // 1.7s decay time
const PPM_UPDATE_INTERVAL = 16 // 16ms update interval (~60fps)

// Stream health monitoring
const startStreamHealthMonitoring = () => {
  if (streamHealthTimer.value) clearInterval(streamHealthTimer.value)
  
  streamHealthTimer.value = setInterval(() => {
    const now = Date.now()
    const timeSinceLastData = now - lastDataReceived.value
    
    // If no data received for 15 seconds, try to recover (increased from 10s)
    if (timeSinceLastData > 15000 && currentSubscription.value && props.device && props.channel) {
      console.log(`⚠️ Stream ${currentSubscription.value} appears stale, attempting recovery...`)
      
      // Unsubscribe and resubscribe to restart the stream
      unsubscribe(props.device, Number(props.channel))
      setTimeout(() => {
        subscribe(props.device, Number(props.channel))
        console.log(`🔄 Restarted stream: ${currentSubscription.value}`)
      }, 1000)
    }
  }, 5000) // Check every 5 seconds
}

const stopStreamHealthMonitoring = () => {
  if (streamHealthTimer.value) {
    clearInterval(streamHealthTimer.value)
    streamHealthTimer.value = null
  }
}

// Subscribe to device when props change
watch([() => props.device, () => props.channel, connected], ([newDevice, newChannel, isConnected], [oldDevice, oldChannel, wasConnected]) => {
  console.log(`🔍 AudioMeter watcher triggered - connected: ${isConnected}, device: ${newDevice}, channel: ${newChannel}`)
  // Unsubscribe from previous subscription if it exists
  if (currentSubscription.value && oldDevice && oldChannel) {
    console.log(`🔄 Unsubscribing from previous: ${oldDevice}:${oldChannel}`)
    unsubscribe(oldDevice, Number(oldChannel))
    currentSubscription.value = null
  }
  
  if (newDevice && newChannel) {
    const subscriptionKey = `${newDevice}:${newChannel}`
    console.log(`🔄 AudioMeter subscribing to: ${subscriptionKey}`)
    console.log(`🔍 AudioMeter props - device: "${newDevice}" (${typeof newDevice}), channel: "${newChannel}" (${typeof newChannel})`)
    
    // Wait for connection if not connected yet
    if (!isConnected) {
      console.log(`⏳ AudioMeter waiting for WebSocket connection before subscribing to ${subscriptionKey}`)
      // Wait for connection with retry
      const retrySubscription = () => {
        if (connected.value) {
          console.log(`✅ AudioMeter WebSocket connected, now subscribing to ${subscriptionKey}`)
          subscribe(newDevice, Number(newChannel))
          currentSubscription.value = subscriptionKey
        } else {
          console.log(`⏳ AudioMeter still waiting for connection, retrying in 500ms...`)
          setTimeout(retrySubscription, 500)
        }
      }
      setTimeout(retrySubscription, 100)
    } else {
      console.log(`✅ AudioMeter WebSocket already connected, subscribing to ${subscriptionKey}`)
      subscribe(newDevice, Number(newChannel))
      currentSubscription.value = subscriptionKey
    }
    
    // Start monitoring the new stream
    startStreamHealthMonitoring()
  }
}, { immediate: true })

// Start PPM timer for reactive updates
ppmTimer = setInterval(() => {
  ppmTick.value++
}, PPM_UPDATE_INTERVAL)

// Cleanup on component unmount
onUnmounted(() => {
  if (ppmTimer) {
    clearInterval(ppmTimer)
    ppmTimer = null
  }
  if (peakDecayTimer.value) {
    clearInterval(peakDecayTimer.value)
    peakDecayTimer.value = null
  }
  stopStreamHealthMonitoring()
  if (currentSubscription.value && props.device && props.channel) {
    console.log(`🧹 Component unmounting, unsubscribing from: ${currentSubscription.value}`)
    unsubscribe(props.device, Number(props.channel))
  }
})

// Get current meter data
const currentMeterData = computed(() => {
  const data = getMeterData(props.device, props.channel)
  if (data && data.lastUpdate) {
    lastDataReceived.value = data.lastUpdate
  }
  return data
})

// Calculate raw peak position for PPM (0-100%)
const rawPeakPosition = computed(() => {
  if (!currentMeterData.value?.channels?.[0]) return 0
  const peakDb = parseFloat(currentMeterData.value.channels[0].peak)
  
  // Handle -Infinity (silence) from server
  if (!isFinite(peakDb) || peakDb < -60) return 0
  
  // Precise calibration: Map -60dB to 0dB to 0-100%
  const serverPosition = Math.max(0, Math.min(100, (peakDb + 60) * (5/3)))
  
  // Convert server's -60 to 0dB range to client's -40 to 0dB display range
  // Using exact fractions: (serverPosition - 100/3) * 1.5
  const clientPosition = Math.max(0, (serverPosition - 100/3) * 1.5)
  
  return clientPosition
})

// PPM meter position with proper attack/decay timing
const rmsPosition = computed(() => {
  // Include ppmTick for reactivity
  ppmTick.value // This ensures the computed updates on timer
  
  const now = Date.now()
  const targetPosition = rawPeakPosition.value // PPM uses peak, not RMS
  
  // If no previous update, initialize immediately
  if (lastPpmUpdate.value === 0) {
    ppmPosition.value = targetPosition
    lastPpmUpdate.value = now
    return targetPosition
  }
  
  const timeDelta = now - lastPpmUpdate.value
  const isIncreasing = targetPosition > ppmPosition.value
  
  if (isIncreasing) {
    // PPM Attack: 10ms to reach 99% of target
    // Rate = ln(100) / 10ms = 0.4605 per ms
    const attackRate = 0.4605 * timeDelta
    const factor = 1 - Math.exp(-attackRate)
    ppmPosition.value += (targetPosition - ppmPosition.value) * factor
  } else {
    // PPM Decay: 1.7s to fall from 100% to 10%
    // Rate = ln(10) / 1700ms = 0.001354 per ms
    const decayRate = 0.001354 * timeDelta
    const factor = Math.exp(-decayRate)
    ppmPosition.value = targetPosition + (ppmPosition.value - targetPosition) * factor
  }
  
  lastPpmUpdate.value = now
  return ppmPosition.value
})

// Calculate meter gradient based on level
const getMeterGradient = (position: number) => {
  // Convert position to dB for color calculation
  const dbValue = (position / 100) * 40 - 40
  
  if (dbValue >= -9) {
    // Red zone (-9dB to 0dB)
    return 'linear-gradient(to top, #dc2626, #ef4444)'
  } else if (dbValue >= -18) {
    // Yellow zone (-18dB to -9dB)
    return 'linear-gradient(to top, #eab308, #facc15)'
  } else {
    // Green zone (-40dB to -18dB)
    return 'linear-gradient(to top, #16a34a, #22c55e)'
  }
}

// Stream health indicators
const getConnectionStatusClass = () => {
  if (!connected.value) return 'bg-red-400'
  if (connecting.value) return 'bg-yellow-400'
  
  // Check if stream is stale
  const now = Date.now()
  const timeSinceLastData = now - lastDataReceived.value
  if (timeSinceLastData > 8000) return 'bg-orange-400' // Stream might be stale
  
  return 'bg-green-400' // All good
}

const getConnectionStatusText = () => {
  if (!connected.value) return 'OFF'
  if (connecting.value) return '...'
  
  // Check if stream is stale
  const now = Date.now()
  const timeSinceLastData = now - lastDataReceived.value
  if (timeSinceLastData > 8000) return 'STALE'
  
  return 'ON'
}

// PPM peak hold decay timer  
const peakDecayTimer = ref<any>(null)

// Start PPM-compliant peak hold decay
const startPeakDecay = () => {
  if (peakDecayTimer.value) clearInterval(peakDecayTimer.value)
  
  peakDecayTimer.value = setInterval(() => {
    // PPM peak hold: 20dB/s decay rate after 1.5s hold time
    const now = Date.now()
    const timeSincePeakCaptured = now - peakHoldCaptureTime.value
    
    if (timeSincePeakCaptured > 1500) { // 1.5s hold time before decay
      // 20dB/s = 2dB per 100ms
      const newPeakHold = currentPeakHold.value - 2.0
      if (newPeakHold > -60) {
        currentPeakHold.value = newPeakHold
        
        // Update position with precise calibration
        const serverPosition = Math.max(0, Math.min(100, (newPeakHold + 60) * (5/3)))
        const clientPosition = Math.max(0, (serverPosition - 100/3) * 1.5)
        peakHoldPosition.value = clientPosition
      } else {
        showPeakHold.value = false
        currentPeakHold.value = -60
      }
    }
  }, 100) // Check every 100ms
}

// Update peak hold when peak changes
watch(() => currentMeterData.value?.channels?.[0]?.peak, (newPeak) => {
  if (newPeak) {
    const peakDb = parseFloat(newPeak)
    
    // Handle -Infinity (silence) from server
    if (!isFinite(peakDb) || peakDb < -60) return
    
    // PPM peak hold: Update if current peak exceeds held value
    if (peakDb > currentPeakHold.value) {
      currentPeakHold.value = peakDb // Reset to current peak level
      peakHoldCaptureTime.value = Date.now() // Track when peak was captured
      
      // Use precise calibration matching PPM meter
      const serverPosition = Math.max(0, Math.min(100, (peakDb + 60) * (5/3)))
      const clientPosition = Math.max(0, (serverPosition - 100/3) * 1.5)
      peakHoldPosition.value = clientPosition
      
      showPeakHold.value = true
      
      // Clear existing timeout
      if (peakHoldTimeout.value) clearTimeout(peakHoldTimeout.value)
      
      // Show visual indicator for 3 seconds (PPM standard)
      peakHoldTimeout.value = setTimeout(() => {
        showPeakHold.value = false
      }, 3000)
    }
  }
})

// Start peak decay when component mounts
startPeakDecay()
</script>
