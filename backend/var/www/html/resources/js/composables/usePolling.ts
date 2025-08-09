import { ref, onBeforeUnmount } from 'vue'

interface PollingOptions {
  interval?: number
  immediate?: boolean
  onError?: (error: Error) => void
}

export function usePolling(callback: () => void | Promise<void>, options: PollingOptions = {}) {
  const {
    interval = 10000, // Default 10 seconds
    immediate = true,
    onError
  } = options

  const isActive = ref(false)
  const intervalRef = ref<NodeJS.Timeout | null>(null)

  const start = () => {
    if (isActive.value) return

    isActive.value = true

    const executeCallback = async () => {
      try {
        await callback()
      } catch (error) {
        console.error('Polling callback error:', error)
        if (onError) {
          onError(error as Error)
        }
      }
    }

    // Execute immediately if requested
    if (immediate) {
      executeCallback()
    }

    // Set up interval
    intervalRef.value = setInterval(executeCallback, interval)
  }

  const stop = () => {
    if (!isActive.value) return

    isActive.value = false
    if (intervalRef.value) {
      clearInterval(intervalRef.value)
      intervalRef.value = null
    }
  }

  const restart = () => {
    stop()
    start()
  }

  // Cleanup on unmount
  onBeforeUnmount(() => {
    stop()
  })

  return {
    isActive,
    start,
    stop,
    restart
  }
}