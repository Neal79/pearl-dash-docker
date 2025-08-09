<template>
  <v-app>
    <!-- Navigation Drawer -->
    <v-navigation-drawer
      v-model="drawer"
      :rail="rail && !mobile"
      :permanent="!mobile"
      :temporary="mobile"
      :mobile-breakpoint="960"
      color="surface"
      elevation="1"
      :width="280"
      :rail-width="72"
    >
      <!-- Navigation Header -->
      <div class="px-4 py-6">
        <div v-if="!rail" class="d-flex align-center">
          <v-avatar color="primary" size="40" class="mr-3">
            <v-icon color="white" size="24">mdi-view-dashboard</v-icon>
          </v-avatar>
          <div>
            <div class="text-h6 font-weight-bold">Pearl Dash</div>
            <div class="text-caption text-medium-emphasis">Dashboard</div>
          </div>
        </div>
        
        <div v-else class="d-flex justify-center">
          <v-avatar color="primary" size="40">
            <v-icon color="white" size="24">mdi-view-dashboard</v-icon>
          </v-avatar>
        </div>
      </div>

      <v-divider class="mb-2" />

      <!-- Main Navigation -->
      <v-list
        density="compact"
        nav
        class="px-2"
      >
        <v-list-item
          v-for="item in mainNavItems"
          :key="item.value"
          :prepend-icon="item.icon"
          :title="item.title"
          :value="item.value"
          :active="item.active"
          color="primary"
          rounded="xl"
          class="mb-1"
          @click="setActiveItem(item.value)"
        >
          <template v-slot:append v-if="item.badge">
            <v-badge
              :content="item.badge"
              color="error"
              inline
            />
          </template>
        </v-list-item>
      </v-list>

      <!-- Secondary Navigation -->
      <div class="mt-6">
        <v-list-subheader v-if="!rail" class="px-4 text-medium-emphasis">
          TOOLS
        </v-list-subheader>
        
        <v-list
          density="compact"
          nav
          class="px-2"
        >
          <v-list-item
            v-for="item in toolsNavItems"
            :key="item.value"
            :prepend-icon="item.icon"
            :title="item.title"
            :value="item.value"
            :active="item.active"
            color="primary"
            rounded="xl"
            class="mb-1"
            @click="setActiveItem(item.value)"
          />
        </v-list>
      </div>

      <!-- Bottom Navigation -->
      <template v-slot:append>
        <div class="pa-2">
          <v-divider class="mb-2" />
          
          <v-list density="compact" nav>
            <v-list-item
              prepend-icon="mdi-cog"
              title="Settings"
              value="settings"
              color="primary"
              rounded="xl"
              :active="activeItem === 'settings'"
              @click="setActiveItem('settings')"
            />
            
            <v-list-item
              prepend-icon="mdi-help-circle"
              title="Help & Support"
              value="help"
              color="primary"
              rounded="xl"
              :active="activeItem === 'help'"
              @click="setActiveItem('help')"
            />
          </v-list>

          <!-- User Profile (collapsed state) -->
          <div v-if="!rail" class="px-3 py-4 mt-2">
            <div class="d-flex align-center">
              <v-avatar size="32" color="secondary" class="mr-3">
                <v-icon color="white" size="18">mdi-account</v-icon>
              </v-avatar>
              <div class="flex-grow-1">
                <div class="text-body-2 font-weight-medium">Admin User</div>
                <div class="text-caption text-medium-emphasis">admin@example.com</div>
              </div>
              <v-btn
                icon="mdi-dots-vertical"
                size="small"
                variant="text"
                density="compact"
              />
            </div>
          </div>
        </div>
      </template>
    </v-navigation-drawer>

    <!-- App Bar -->
    <v-app-bar
      :elevation="0"
      color="surface"
      border="b"
      height="64"
    >
      <!-- Navigation Toggle -->
      <v-app-bar-nav-icon
        @click="toggleDrawer"
        :icon="rail ? 'mdi-menu-open' : 'mdi-menu'"
      />

      <!-- Page Title -->
      <v-app-bar-title class="font-weight-bold">
        {{ currentPageTitle }}
      </v-app-bar-title>

      <v-spacer />

      <!-- Action Buttons -->
      <div class="d-flex align-center ga-1">
        <!-- Add Device Button -->
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="showAddModal = true"
        >
          Add Device
        </v-btn>
        
        <!-- Search (hidden on mobile) -->
        <v-btn
          v-if="!mobile"
          icon="mdi-magnify"
          variant="text"
          density="comfortable"
        />
        
        <!-- Notifications -->
        <v-btn
          icon="mdi-bell"
          variant="text"
          density="comfortable"
          size="small"
        >
          <v-badge
            content="3"
            color="error"
            offset-x="2"
            offset-y="2"
          >
            <v-icon>mdi-bell</v-icon>
          </v-badge>
        </v-btn>

        <!-- Theme Toggle (hidden on mobile) -->
        <v-btn
          v-if="!mobile"
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          density="comfortable"
          @click="toggleTheme"
        />

        <!-- Profile Menu -->
        <v-menu location="bottom end">
          <template v-slot:activator="{ props }">
            <v-btn
              v-bind="props"
              variant="text"
              density="comfortable"
              size="small"
            >
              <v-avatar :size="mobile ? 28 : 32" color="primary">
                <v-icon color="white" size="16">mdi-account</v-icon>
              </v-avatar>
            </v-btn>
          </template>

          <v-card :min-width="mobile ? 160 : 200">
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-account"
                title="Profile"
                :subtitle="mobile ? undefined : 'View profile'"
              />
              <v-list-item
                prepend-icon="mdi-cog"
                title="Settings"
                :subtitle="mobile ? undefined : 'Application Settings'"
              />
              <!-- Theme toggle for mobile -->
              <v-list-item
                v-if="mobile"
                :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
                :title="isDark ? 'Light Mode' : 'Dark Mode'"
                @click="toggleTheme"
              />
              <v-divider />
              <v-list-item
                prepend-icon="mdi-logout"
                title="Sign Out"
                base-color="error"
                @click="handleLogout"
              />
            </v-list>
          </v-card>
        </v-menu>
      </div>
    </v-app-bar>

    <!-- Main Content Area -->
    <v-main :class="{ 'fullscreen-main': isFullscreen }">
      <!-- Settings Page -->
      <PearlDashSettings v-if="currentPage === 'settings'" />
      
      <!-- Dashboard Page (Default) -->
      <PearlDeviceGrid
        v-else
        :devices="devices"
        :loading="loading"
        :fullscreen-device-id="fullscreenDeviceId"
        @remove-device="removeDevice"
        @toggle-fullscreen="toggleFullscreen"
        @show-add-modal="showAddModal = true"
        @drag-start="onDragStart"
        @drag-end="onDragEnd"
      />
    </v-main>

    <!-- Add Device Modal -->
    <AddDeviceModalVuetify
      v-if="showAddModal"
      @add="addDevice"
      @close="showAddModal = false"
    />

    <!-- Success Snackbar -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top"
    >
      {{ snackbar.message }}
      <template v-slot:actions>
        <v-btn
          variant="text"
          @click="snackbar.show = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
// @claude: protected logic, do not modify without CLAUDE.md review section
import { ref, computed, onMounted, watch } from 'vue'
import { useTheme, useDisplay } from 'vuetify'
import { router } from '@inertiajs/vue3'
import { useApiAuth } from '@/composables/useApiAuth'
import PearlDeviceGrid from '@/pages/PearlDeviceGrid.vue'
import PearlDashSettings from '@/pages/PearlDashSettings.vue'
import AddDeviceModalVuetify from '@/components/AddDeviceModalVuetify.vue'

// Props from Inertia
const props = withDefaults(defineProps<{
  page?: string
}>(), {
  page: 'dashboard'
})

interface Device {
  id: number
  name?: string
  ip: string
  username: string
  password: string
}

interface DeviceFormData {
  ip: string
  name: string
  username: string
  password: string
}

// Theme management
const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)

// Mobile detection
const { mobile } = useDisplay()

// Current page based on props
const currentPage = computed(() => props.page)

const toggleTheme = () => {
  theme.global.name.value = isDark.value ? 'light' : 'dark'
  localStorage.setItem('theme', theme.global.name.value)
}

// Navigation state management
const drawer = ref(true)
const rail = ref(false)
const activeItem = computed(() => currentPage.value || 'dashboard')

// Load drawer state from localStorage
const loadDrawerState = () => {
  const saved = localStorage.getItem('dashboard-drawer-state')
  if (saved) {
    const state = JSON.parse(saved)
    // Default to closed on mobile, open on desktop
    drawer.value = mobile.value ? false : (state.drawer ?? true)
    rail.value = state.rail ?? false
  } else {
    // Initial state: closed on mobile, open on desktop
    drawer.value = !mobile.value
    rail.value = false
  }
}

// Save drawer state to localStorage
const saveDrawerState = () => {
  localStorage.setItem('dashboard-drawer-state', JSON.stringify({
    drawer: drawer.value,
    rail: rail.value
  }))
}

// Watch for state changes and persist them
watch([drawer, rail], () => {
  saveDrawerState()
}, { deep: true })

// Toggle drawer rail mode
const toggleDrawer = () => {
  if (mobile.value) {
    // On mobile: just toggle drawer open/closed
    drawer.value = !drawer.value
  } else {
    // On desktop: cycle through states
    if (drawer.value && !rail.value) {
      rail.value = true
    } else if (rail.value) {
      rail.value = false
    } else {
      drawer.value = true
    }
  }
}

// Navigation items
const mainNavItems = computed(() => [
  {
    title: 'Dashboard',
    icon: 'mdi-view-dashboard',
    value: 'dashboard',
    active: activeItem.value === 'dashboard',
  },
  {
    title: 'Devices',
    icon: 'mdi-monitor',
    value: 'devices',
    active: activeItem.value === 'devices',
    badge: devices.value.length.toString(),
  },
  {
    title: 'Audio Streams',
    icon: 'mdi-headphones',
    value: 'streams',
    active: activeItem.value === 'streams',
  },
  {
    title: 'Analytics',
    icon: 'mdi-chart-line',
    value: 'analytics',
    active: activeItem.value === 'analytics',
  },
  {
    title: 'Recordings',
    icon: 'mdi-record-rec',
    value: 'recordings',
    active: activeItem.value === 'recordings',
  },
])

const toolsNavItems = computed(() => [
  {
    title: 'System Health',
    icon: 'mdi-heart-pulse',
    value: 'health',
    active: activeItem.value === 'health',
  },
  {
    title: 'Logs',
    icon: 'mdi-text-box-multiple',
    value: 'logs',
    active: activeItem.value === 'logs',
  },
  {
    title: 'API Explorer',
    icon: 'mdi-api',
    value: 'api',
    active: activeItem.value === 'api',
  },
])

// Set active navigation item
const setActiveItem = (value: string) => {
  // Handle navigation using Inertia router
  if (value === 'dashboard') {
    router.visit('/dashboard')
  } else if (value === 'settings') {
    router.visit('/settings')
  }
  // For other items, no action yet (future implementation)
}

// Current page title based on active item
const currentPageTitle = computed(() => {
  const allItems = [...mainNavItems.value, ...toolsNavItems.value]
  const item = allItems.find(item => item.value === activeItem.value)
  return item?.title || 'Dashboard'
})

// Device management state
const devices = ref<Device[]>([])
const loading = ref(true)
const showAddModal = ref(false)
const dragging = ref(false)

// API authentication
const apiAuth = useApiAuth()

// Fullscreen state
const fullscreenDeviceId = ref<number | null>(null)
const isFullscreen = computed(() => fullscreenDeviceId.value !== null)

// Snackbar for notifications
const snackbar = ref({
  show: false,
  message: '',
  color: 'success'
})

// Card order persistence
const DEVICE_ORDER_KEY = 'pearl-dashboard-device-order'

const saveDeviceOrder = () => {
  try {
    const orderData = devices.value.map(device => device.id)
    localStorage.setItem(DEVICE_ORDER_KEY, JSON.stringify(orderData))
    console.log('💾 Device order saved:', orderData)
  } catch (error) {
    console.warn('Failed to save device order:', error)
  }
}

const restoreDeviceOrder = (loadedDevices: Device[]) => {
  try {
    const savedOrder = localStorage.getItem(DEVICE_ORDER_KEY)
    if (!savedOrder) return loadedDevices

    const orderIds = JSON.parse(savedOrder) as number[]
    console.log('📂 Restoring device order:', orderIds)

    // Sort devices according to saved order
    const orderedDevices = [...loadedDevices]
    orderedDevices.sort((a, b) => {
      const aIndex = orderIds.indexOf(a.id)
      const bIndex = orderIds.indexOf(b.id)
      
      // If device not in saved order, put it at the end
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      
      return aIndex - bIndex
    })

    return orderedDevices
  } catch (error) {
    console.warn('Failed to restore device order:', error)
    return loadedDevices
  }
}

// Load devices from API
const loadDevices = async () => {
  try {
    loading.value = true
    const data = await apiAuth.get<Device[]>('/api/devices')
    
    // Restore saved order
    devices.value = restoreDeviceOrder(data)
  } catch (error) {
    console.error('Error loading devices:', error)
    showSnackbar('Failed to load devices', 'error')
  } finally {
    loading.value = false
  }
}

// Add device handler
const addDevice = async (deviceData: DeviceFormData) => {
  try {
    const data = await apiAuth.post<Device>('/api/devices', deviceData)
    devices.value.push(data)
    showAddModal.value = false
    showSnackbar(`Device ${data.name || data.ip} added successfully!`, 'success')
    
    // Save new order with added device
    saveDeviceOrder()
  } catch (error: any) {
    console.error('Error adding device:', error)
    const message = error.response?.data?.message || 'Failed to add device'
    showSnackbar(message, 'error')
  }
}

// Remove device handler
const removeDevice = async (deviceId: number) => {
  try {
    await apiAuth.delete(`/api/devices/${deviceId}`)
    const removedDevice = devices.value.find(d => d.id === deviceId)
    devices.value = devices.value.filter(d => d.id !== deviceId)
    
    showSnackbar(`Device ${removedDevice?.name || removedDevice?.ip} removed successfully!`, 'success')
    
    // Update saved order after removal
    saveDeviceOrder()
  } catch (error) {
    console.error('Error removing device:', error)
    showSnackbar('Failed to remove device', 'error')
  }
}

// Drag and drop handlers
const onDragStart = () => {
  dragging.value = true
}

const onDragEnd = (newDevices: Device[]) => {
  dragging.value = false
  
  // Update devices with new order from child component
  devices.value = newDevices
  
  // Save the new order to localStorage
  saveDeviceOrder()
  
  // Log the new order
  console.log('📋 New device order:', devices.value.map(d => ({ id: d.id, name: d.name || d.ip })))
}

// Fullscreen toggle handler
const toggleFullscreen = (deviceId: number) => {
  if (fullscreenDeviceId.value === deviceId) {
    // Exit fullscreen
    fullscreenDeviceId.value = null
    console.log('📺 Exited fullscreen mode')
  } else {
    // Enter fullscreen
    fullscreenDeviceId.value = deviceId
    const device = devices.value.find(d => d.id === deviceId)
    console.log(`📺 Entered fullscreen mode for ${device?.name || device?.ip}`)
  }
}

// Show snackbar helper
const showSnackbar = (message: string, color: string = 'success') => {
  snackbar.value = {
    show: true,
    message,
    color
  }
}

// Handle logout
const handleLogout = async () => {
  try {
    router.post('/logout', {}, {
      onSuccess: () => {
        showSnackbar('Logged out successfully', 'success')
      },
      onError: (errors) => {
        console.error('Logout failed:', errors)
        showSnackbar('Logout failed', 'error')
      }
    })
  } catch (error) {
    console.error('Unexpected error during logout:', error)
    showSnackbar('An unexpected error occurred', 'error')
  }
}

// Initialize component
onMounted(() => {
  loadDrawerState()
  
  // Load theme from localStorage
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    theme.global.name.value = savedTheme
  }
  
  // Load devices
  loadDevices()
})
</script>

<style scoped>
/* Mobile-specific adjustments */
@media (max-width: 960px) {
  :deep(.v-app-bar-title) {
    font-size: 1.1rem !important;
  }
  
  /* Ensure content doesn't overflow */
  :deep(.v-main) {
    overflow-x: hidden;
  }
}

/* Custom app bar shadow */
:deep(.v-app-bar) {
  backdrop-filter: blur(10px);
}

/* Smooth transitions */
.v-navigation-drawer {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Custom scrollbar for navigation */
:deep(.v-navigation-drawer__content) {
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--v-theme-outline-variant)) transparent;
}

:deep(.v-navigation-drawer__content)::-webkit-scrollbar {
  width: 4px;
}

:deep(.v-navigation-drawer__content)::-webkit-scrollbar-track {
  background: transparent;
}

:deep(.v-navigation-drawer__content)::-webkit-scrollbar-thumb {
  background-color: rgb(var(--v-theme-outline-variant));
  border-radius: 4px;
}

/* Enhanced list item styling */
:deep(.v-list-item--active) {
  font-weight: 600;
}

/* Override v-main in fullscreen mode */
.fullscreen-main {
  padding: 0 !important;
  margin: 0 !important;
  height: calc(100vh - 64px) !important;
  overflow: hidden !important;
}
</style>