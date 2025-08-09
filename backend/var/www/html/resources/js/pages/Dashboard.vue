<template>
  <div class="flex min-h-screen bg-gray-900 relative overflow-hidden">
    <!-- Left Sidebar -->
    <aside 
      :class="[
        'bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-300 ease-in-out',
        'fixed md:relative z-50 h-full',
        sidebarVisible ? 'w-64' : 'w-0 overflow-hidden',
        sidebarVisible ? 'left-0' : '-left-64'
      ]"
    >
      <div class="p-4">
        <h2 class="text-xl font-bold text-gray-100">Pearl Dash</h2>
      </div>
      
      <!-- Navigation Links -->
      <nav class="flex-1 px-4 py-2 flex flex-col">
        <ul class="space-y-2">
          <li>
            <a href="#" class="flex items-center px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors bg-gray-700 text-white">
              <span>Dashboard</span>
            </a>
          </li>
          <li>
            <a href="#" class="flex items-center px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors">
              <span>Devices</span>
            </a>
          </li>
          <li>
            <a href="#" class="flex items-center px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors">
              <span>Audio Streams</span>
            </a>
          </li>
          <li>
            <a href="#" class="flex items-center px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors">
              <span>Monitoring</span>
            </a>
          </li>
        </ul>
        
        <!-- Spacer to push settings to bottom -->
        <div class="flex-1"></div>
        
        <!-- Settings at Bottom -->
        <div class="pt-4 border-t border-gray-700">
          <a href="#" class="flex items-center px-3 py-2 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors">
            <span>Settings</span>
          </a>
        </div>
      </nav>
    </aside>

    <!-- Mobile backdrop overlay -->
    <div 
      v-if="sidebarVisible" 
      @click="sidebarVisible = false"
      class="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
    ></div>

    <!-- Main Content -->
    <div class="flex-1 p-4">
      <header class="flex items-center justify-between mb-6">
        <div class="flex items-center space-x-4">
          <!-- Hamburger Menu Button -->
          <button 
            @click="sidebarVisible = !sidebarVisible"
            class="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
          <h1 class="text-3xl font-bold text-gray-100">Pearl Mini Dashboard</h1>
        </div>
        <div class="flex items-center space-x-4">
          <button @click="showAdd = true" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-sm rounded shadow-lg transition-colors">
            Add Device
          </button>
        </div>
      </header>


      <div class="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <!-- Device Cards -->
        <DeviceCard
          v-for="device in devices"
          :key="device.id"
          :device="device"
          :show-debug="false"
          @remove="removeDevice"
        />
      </div>

      <!-- Empty State -->
      <div v-if="devices.length === 0" class="text-center py-12">
        <div class="text-gray-400 text-lg mb-4">No devices added yet</div>
        <button @click="showAdd = true" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg transition-colors">
          Add Your First Device
        </button>
      </div>

      <AddDeviceModal
        v-if="showAdd"
        @add="addDevice"
        @close="showAdd = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApiAuth } from '@/composables/useApiAuth';
import AddDeviceModal from '@/components/AddDeviceModal.vue';
import DeviceCard from '@/components/DeviceCard.vue';

// State
const devices = ref<Array<{ id: number; ip: string; name?: string; username: string; password: string }>>([]);
const showAdd = ref(false);
const sidebarVisible = ref(false); // Sidebar visibility state

// API authentication
const apiAuth = useApiAuth();

// Fetch existing devices on mount
onMounted(async () => {
  try {
    const data = await apiAuth.get('/api/devices');
    devices.value = data;
  } catch (e) {
    console.error('Error fetching devices:', e);
  }
});

// Handler for AddDeviceModal's @add
async function addDevice(payload: { ip: string; name?: string; username: string; password: string }) {
  try {
    const data = await apiAuth.post('/api/devices', payload);
    devices.value.push(data);
    showAdd.value = false;
  } catch (e) {
    console.error('Error adding device:', e);
  }
}

// Handler for DeviceCard's @remove
async function removeDevice(id: number) {
  try {
    await apiAuth.delete(`/api/devices/${id}`);
    devices.value = devices.value.filter(d => d.id !== id);
  } catch (e) {
    console.error('Error removing device:', e);
  }
}
</script>
