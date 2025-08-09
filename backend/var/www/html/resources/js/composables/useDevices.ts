import { ref, onMounted } from 'vue'
import { useApiAuth } from './useApiAuth'

export interface Device {
  id: number
  ip: string
  name?: string
  username: string
  password: string
}

export interface AddDeviceForm {
  ip: string
  name?: string
  username: string
  password: string
}

export function useDevices() {
  // State
  const devices = ref<Device[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // API authentication
  const apiAuth = useApiAuth()

  // Fetch all devices
  const fetchDevices = async () => {
    loading.value = true
    error.value = null
    
    try {
      const data = await apiAuth.get<Device[]>('/api/devices')
      devices.value = data
    } catch (e) {
      error.value = 'Failed to fetch devices'
      console.error('Error fetching devices:', e)
    } finally {
      loading.value = false
    }
  }

  // Add a new device
  const addDevice = async (deviceData: AddDeviceForm): Promise<Device | null> => {
    loading.value = true
    error.value = null
    
    try {
      const data = await apiAuth.post<Device>('/api/devices', deviceData)
      devices.value.push(data)
      return data
    } catch (e) {
      error.value = 'Failed to add device'
      console.error('Error adding device:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  // Remove a device
  const removeDevice = async (deviceId: number): Promise<boolean> => {
    loading.value = true
    error.value = null
    
    try {
      await apiAuth.delete(`/api/devices/${deviceId}`)
      devices.value = devices.value.filter(d => d.id !== deviceId)
      return true
    } catch (e) {
      error.value = 'Failed to remove device'
      console.error('Error removing device:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  // Find device by ID
  const findDevice = (deviceId: number): Device | undefined => {
    return devices.value.find(d => d.id === deviceId)
  }

  // Auto-fetch devices on mount
  onMounted(() => {
    fetchDevices()
  })

  return {
    // State
    devices: devices.value,
    loading,
    error,
    
    // Actions
    fetchDevices,
    addDevice,
    removeDevice,
    findDevice,
  }
}