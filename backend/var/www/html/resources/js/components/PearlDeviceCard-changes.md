# PearlDeviceCard.vue Changes for Preview Image Caching

## Minimal Integration Steps

### 1. Add Import (line ~278)
```javascript
import { usePreviewImage } from '../composables/usePreviewImage'
```

### 2. Replace Image Logic (after line ~322)

**REMOVE these sections:**
```javascript
// Remove the old currentDisplayUrl and image functions (lines ~429-511)
const currentDisplayUrl = ref('')
const loadNewImage = (url: string): Promise<void> => { ... }
const refreshImage = async () => { ... }
const onImageError = () => { ... }
const initializeImage = async () => { ... }
```

**ADD this instead:**
```javascript
// Preview image caching integration
const { imageUrl: cachedImageUrl, isSubscribed, error: previewError } = usePreviewImage(
  computed(() => props.device.id),
  selectedChannel
)

// Seamless image URL that works with existing PreviewTab
const currentDisplayUrl = computed(() => {
  const url = cachedImageUrl.value
  if (url) return url
  
  // Fallback for safety (should rarely be used)
  const fallbackUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzlDQTNBRiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
  return fallbackUrl
})

// Simple error handler that works with PreviewTab
const onImageError = () => {
  console.warn(`🖼️ Image error for ${props.device.name || props.device.ip} channel ${selectedChannel.value}`)
  // The composable handles fallback automatically
}
```

### 3. Update onMounted (around line ~608)
**REMOVE:**
```javascript
// Remove these lines:
if (selectedChannel.value) {
  await initializeImage()
  imageRefreshInterval = setInterval(refreshImage, 5000)
}
```

**REPLACE with:**
```javascript
// Preview images are now handled automatically by usePreviewImage composable
console.log('📸 Preview images managed by usePreviewImage composable')
```

### 4. Update onBeforeUnmount (around line ~622)
**REMOVE:**
```javascript
// Clear image refresh interval  
if (imageRefreshInterval) {
  clearInterval(imageRefreshInterval)
}
```
*(This is no longer needed since the composable handles subscription cleanup)*

### 5. Update watch(selectedChannel) (around line ~684)
**REMOVE:**
```javascript
// Handle image refresh interval with stability
if (imageRefreshInterval) {
  clearInterval(imageRefreshInterval)
}
if (selectedChannel.value) {
  currentDisplayUrl.value = '' // Clear current image
  await initializeImage()
  imageRefreshInterval = setInterval(refreshImage, 5000)
} else {
  currentDisplayUrl.value = ''
}
```

**REPLACE with:**
```javascript
// Preview images automatically handled by usePreviewImage composable
// (watch in composable will handle resubscription on channel change)
console.log('📸 Preview image subscription updated for new channel')
```

### 6. Remove Variable Declarations
**REMOVE:**
```javascript
// Remove this line (around line ~471):
let imageRefreshInterval: any
```

## Result
- ✅ **Same UI/UX**: PreviewTab receives `currentDisplayUrl` exactly as before
- ✅ **Cached Images**: Now served from preview-image-service  
- ✅ **Auto-subscription**: Composable handles mount/unmount/channel changes
- ✅ **Graceful Fallback**: Falls back to direct API if service unavailable
- ✅ **Multi-user Safe**: Unique subscriber IDs prevent conflicts
- ✅ **Same Refresh Rate**: UI still updates (service caches backend)

## File Location
You'll need to move `/home/neal/usePreviewImage.js` to:
`/home/neal/pearl-dash/Docker Dash/backend/var/www/html/resources/js/composables/usePreviewImage.js`