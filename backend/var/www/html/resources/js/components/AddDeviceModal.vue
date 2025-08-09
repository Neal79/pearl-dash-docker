<template>
  <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
    <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
      <h2 class="text-xl font-semibold mb-4">Add Pearl Device</h2>
      <form @submit.prevent="submitForm">
        <label class="block mb-2">
          IP Address
          <input v-model="form.ip" type="text" required class="w-full mt-1 p-2 border rounded" placeholder="192.168.1.100"/>
        </label>
        <label class="block mb-2">
          Name (optional)
          <input v-model="form.name" type="text" class="w-full mt-1 p-2 border rounded" placeholder="Main Lobby"/>
        </label>
        <label class="block mb-2">
          Username
          <input v-model="form.username" type="text" required class="w-full mt-1 p-2 border rounded" placeholder="admin"/>
        </label>
        <label class="block mb-4">
          Password
          <input v-model="form.password" type="password" required class="w-full mt-1 p-2 border rounded" placeholder="Password"/>
        </label>
        <div class="flex justify-end">
          <button type="button" @click="$emit('close')" class="px-4 py-2 mr-2 bg-gray-200 rounded">Cancel</button>
          <button type="submit" class="px-4 py-2 bg-green-500 text-white rounded">Add</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AddDeviceModal',
  data() {
    return {
      form: { ip: '', name: '', username: '', password: '' }
    };
  },
  methods: {
    submitForm() {
      this.$emit('add', { ...this.form });
      this.form.ip = '';
      this.form.name = '';
      this.form.username = '';
      this.form.password = '';
    }
  }
};
</script>
