import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import dotenv from 'dotenv';
import JWTAuth from './jwt-auth.js';

// Load environment variables - try Docker env first, then .env file as fallback
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '../.env' });
}

class AudioMeterService {
  constructor(port = 3444) {
    this.port = port;
    this.wss = null;
    this.clients = new Map(); // clientId -> { ws: WebSocket, user: UserInfo }
    this.audioProcessors = new Map(); // "ip:channel" -> FFmpeg process
    this.meterData = new Map(); // "ip:channel" -> latest meter readings
    this.subscriptions = new Map(); // clientId -> Set of "ip:channel" subscriptions
    this.audioSubscriptions = new Map(); // clientId -> Set of "ip:channel" audio subscriptions
    this.healthCheckTimers = new Map(); // "ip:channel" -> health check timer
    this.quasiPeakStates = new Map(); // "ip:channel" -> quasi-peak detector state
    
    // Initialize JWT authentication
    try {
      this.jwtAuth = new JWTAuth();
    } catch (error) {
      console.error('❌ Failed to initialize JWT authentication:', error.message);
      process.exit(1);
    }
    
    // Security: Connection limiting for DoS protection
    this.connectionsByIP = new Map(); // IP -> connection count
    this.MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 20;
    
    // Security: Load allowed device networks from environment or use defaults
    this.allowedNetworks = this.loadAllowedNetworks();
    
    // PPM Constants (IEC 60268-10)
    this.PPM_INTEGRATION_TIME = 5; // 5ms integration time for quasi-peak
    this.PPM_ATTACK_COEFF = Math.exp(-1000 / (48000 * 0.01)); // 10ms attack at 48kHz
    this.PPM_DECAY_COEFF = Math.exp(-1000 / (48000 * 1.7)); // 1.7s decay at 48kHz
    this.MAX_CONCURRENT_PROCESSES = parseInt(process.env.AUDIO_METER_MAX_CONNECTIONS) || 50; // Configurable via .env
    
    this.setupWebSocketServer();
    console.log(`🎵 Audio Meter Service starting on port ${port}`);
    console.log(`📊 Max concurrent processes: ${this.MAX_CONCURRENT_PROCESSES}`);
    console.log(`🔒 Max connections per IP: ${this.MAX_CONNECTIONS_PER_IP}`);
    
    // Log loaded network configuration
    if (this.allowedNetworks.length > 0) {
      console.log(`🔒 Loaded network security configuration:`);
      this.allowedNetworks.forEach((network, index) => {
        console.log(`   ${index + 1}. ${network.originalCIDR} → ${network.network}/${network.prefixLength}`);
      });
    } else {
      console.log(`🔒 No specific networks configured, using default private IP validation`);
    }
  }

  // Security: Load allowed device networks from environment variable or use secure defaults
  loadAllowedNetworks() {
    const envNetworks = process.env.ALLOWED_AUDIO_DEVICES;
    if (envNetworks) {
      try {
        const networks = envNetworks.split(',').map(net => net.trim());
        const validNetworks = [];
        
        for (const network of networks) {
          if (network.includes('/')) {
            // CIDR format: 192.168.1.0/24
            const parsed = this.parseCIDR(network);
            if (parsed) {
              validNetworks.push(parsed);
              console.log(`🔒 Added CIDR network: ${network} (${parsed.network}/${parsed.prefixLength})`);
            } else {
              console.warn(`⚠️ Invalid CIDR format: ${network}`);
            }
          } else {
            // Individual IP: 192.168.1.100
            if (this.isValidIPv4(network)) {
              // Convert single IP to /32 CIDR
              const parsed = this.parseCIDR(`${network}/32`);
              if (parsed) {
                validNetworks.push(parsed);
                console.log(`🔒 Added individual IP: ${network} (converted to ${network}/32)`);
              }
            } else {
              console.warn(`⚠️ Invalid IP address: ${network}`);
            }
          }
        }
        
        console.log(`🔒 Loaded ${validNetworks.length} allowed networks from environment`);
        return validNetworks;
      } catch (error) {
        console.error('❌ Error parsing ALLOWED_AUDIO_DEVICES:', error);
      }
    }
    
    // Default to local network ranges if no environment config
    console.warn('⚠️ No ALLOWED_AUDIO_DEVICES configured, using default private networks');
    return []; // Empty array means we'll use fallback private network validation
  }

  // Security: Parse CIDR notation (e.g., "192.168.1.0/24") 
  parseCIDR(cidr) {
    try {
      const [networkStr, prefixStr] = cidr.split('/');
      
      if (!networkStr || !prefixStr) {
        return null;
      }
      
      // Validate network IP
      if (!this.isValidIPv4(networkStr)) {
        return null;
      }
      
      // Validate prefix length
      const prefixLength = parseInt(prefixStr);
      if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
        return null;
      }
      
      // Convert IP to 32-bit integer
      const networkParts = networkStr.split('.').map(num => parseInt(num));
      const networkInt = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
      
      // Calculate subnet mask
      const mask = (0xFFFFFFFF << (32 - prefixLength)) >>> 0;
      
      // Calculate network address (apply mask)
      const networkAddr = (networkInt & mask) >>> 0;
      
      return {
        network: this.intToIP(networkAddr),
        networkInt: networkAddr,
        mask: mask,
        prefixLength: prefixLength,
        originalCIDR: cidr
      };
    } catch (error) {
      console.error(`❌ Error parsing CIDR ${cidr}:`, error);
      return null;
    }
  }

  // Security: Convert 32-bit integer back to IP string
  intToIP(intAddr) {
    return [
      (intAddr >>> 24) & 0xFF,
      (intAddr >>> 16) & 0xFF, 
      (intAddr >>> 8) & 0xFF,
      intAddr & 0xFF
    ].join('.');
  }

  // Security: Check if IP is within a CIDR network
  isIPInNetwork(ip, network) {
    try {
      console.log(`🔍 Checking if ${ip} is in network ${network.originalCIDR}`);
      
      // Convert IP to 32-bit integer
      const ipParts = ip.split('.').map(num => parseInt(num));
      const ipInt = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
      
      // Apply network mask and compare
      const ipNetwork = (ipInt & network.mask) >>> 0;
      const match = ipNetwork === network.networkInt;
      
      console.log(`🔍 IP ${ip} (${ipInt}) & mask (${network.mask.toString(16)}) = ${ipNetwork.toString(16)} vs network ${network.networkInt.toString(16)}: ${match ? 'MATCH' : 'NO MATCH'}`);
      
      return match;
    } catch (error) {
      console.error(`❌ Error checking IP ${ip} against network ${network.originalCIDR}:`, error);
      return false;
    }
  }

  // Security: Validate IPv4 address format
  isValidIPv4(ip) {
    console.log(`🔍 Validating IPv4: "${ip}"`);
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const isValid = ipv4Regex.test(ip);
    console.log(`🔍 IPv4 regex test result: ${isValid}`);
    return isValid;
  }

  // Security: Validate channel number
  isValidChannel(channel) {
    console.log(`🔍 Validating channel: ${channel} (type: ${typeof channel})`);
    const channelNum = parseInt(channel);
    const isInteger = Number.isInteger(channelNum);
    const inRange = channelNum >= 1 && channelNum <= 999;
    const isValid = isInteger && inRange;
    console.log(`🔍 Channel validation: parseInt(${channel}) = ${channelNum}, isInteger: ${isInteger}, inRange(1-999): ${inRange}, result: ${isValid}`);
    return isValid;
  }

  // Security: Validate device IP against allowlist (now supports CIDR)
  isAllowedDevice(device) {
    console.log(`🔍 Checking device authorization for: ${device}`);
    
    // First check if it's a valid IPv4
    if (!this.isValidIPv4(device)) {
      console.log(`❌ Invalid IPv4 format: ${device}`);
      return false;
    }

    // If network allowlist is configured, check against it
    if (this.allowedNetworks.length > 0) {
      console.log(`🔍 Checking against ${this.allowedNetworks.length} configured networks:`);
      for (const network of this.allowedNetworks) {
        console.log(`🔍 Testing network: ${network.originalCIDR} (${network.network}/${network.prefixLength})`);
        if (this.isIPInNetwork(device, network)) {
          console.log(`✅ Device ${device} matches network ${network.originalCIDR}`);
          return true;
        }
      }
      console.log(`❌ Device ${device} not found in any configured network`);
      return false; // IP not found in any configured network
    }

    console.log(`🔍 No allowlist configured, checking private IP ranges`);
    
    // If no allowlist configured, only allow private IP ranges for security
    const parts = device.split('.').map(num => parseInt(num));
    const [a, b, c, d] = parts;
    
    // Allow only private IP ranges:
    // 192.168.0.0/16, 172.16.0.0/12, 10.0.0.0/8
    const isPrivate = (
      (a === 192 && b === 168) ||                           // 192.168.x.x
      (a === 172 && b >= 16 && b <= 31) ||                 // 172.16.x.x - 172.31.x.x
      (a === 10) ||                                         // 10.x.x.x
      (a === 127 && b === 0 && c === 0 && d === 1)         // localhost only
    );
    
    console.log(`${isPrivate ? '✅' : '❌'} Private IP check for ${device}: ${isPrivate}`);
    return isPrivate;
  }

  // Security: Extract real client IP considering nginx proxy headers
  extractRealIP(req, ws) {
    // Priority order: X-Forwarded-For > X-Real-IP > CF-Connecting-IP > socket address
    let clientIP = 'unknown';
    
    if (req && req.headers) {
      // X-Forwarded-For header (comma-separated list, first is original client)
      if (req.headers['x-forwarded-for']) {
        const forwardedIPs = req.headers['x-forwarded-for'].split(',');
        clientIP = forwardedIPs[0].trim();
        console.log(`🔍 Using X-Forwarded-For IP: ${clientIP} (from: ${req.headers['x-forwarded-for']})`);
      }
      // X-Real-IP header (nginx real_ip module)
      else if (req.headers['x-real-ip']) {
        clientIP = req.headers['x-real-ip'].trim();
        console.log(`🔍 Using X-Real-IP: ${clientIP}`);
      }
      // CloudFlare connecting IP
      else if (req.headers['cf-connecting-ip']) {
        clientIP = req.headers['cf-connecting-ip'].trim();
        console.log(`🔍 Using CF-Connecting-IP: ${clientIP}`);
      }
    }
    
    // Fallback to socket address if no proxy headers
    if (clientIP === 'unknown') {
      clientIP = (ws._socket && ws._socket.remoteAddress) || 
                 (req && req.socket && req.socket.remoteAddress) || 
                 'unknown';
      console.log(`🔍 Using socket address: ${clientIP}`);
    }
    
    // Security: Validate that the extracted IP is a valid IPv4/IPv6
    if (clientIP !== 'unknown' && !this.isValidIP(clientIP)) {
      console.warn(`⚠️ Invalid IP extracted from headers: ${clientIP}, falling back to socket`);
      clientIP = (ws._socket && ws._socket.remoteAddress) || 
                 (req && req.socket && req.socket.remoteAddress) || 
                 'unknown';
    }
    
    return clientIP;
  }

  // Security: Validate IP address (IPv4 or IPv6)
  isValidIP(ip) {
    // Remove IPv6 mapping prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
    const cleanIP = ip.replace(/^::ffff:/, '');
    
    // Check IPv4
    if (this.isValidIPv4(cleanIP)) {
      return true;
    }
    
    // Check IPv6 (basic validation)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    return ipv6Regex.test(ip);
  }

  // Security: Sanitize input for use in shell commands
  sanitizeInput(input, type) {
    console.log(`🔍 Sanitizing input: "${input}" (type: ${type}, typeof: ${typeof input})`);
    
    switch (type) {
      case 'device':
        // Only allow valid IPv4 addresses (must be string)
        if (typeof input !== 'string') {
          console.log(`❌ Device input is not a string: ${typeof input}`);
          return null;
        }
        const isValidIP = this.isValidIPv4(input);
        console.log(`🔍 IPv4 validation for "${input}": ${isValidIP}`);
        return isValidIP ? input : null;
      
      case 'channel':
        // Only accept number inputs for channel (security: strict type validation)
        console.log(`🔍 Parsing channel: "${input}" (type: ${typeof input})`);
        
        if (typeof input !== 'number') {
          console.log(`❌ Channel must be a number, got ${typeof input}`);
          return null;
        }
        
        const channelNum = input;
        const isValidChan = this.isValidChannel(channelNum);
        console.log(`🔍 Channel validation: ${channelNum} → ${isValidChan}`);
        return isValidChan ? channelNum : null;
      
      default:
        console.log(`❌ Unknown sanitization type: ${type}`);
        return null;
    }
  }

  setupWebSocketServer() {
    this.wss = new WebSocketServer({ port: this.port });
    
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      
      // Security: Extract real client IP considering proxy headers
      const realIP = this.extractRealIP(req, ws);
      
      // Security: Authenticate WebSocket connection with JWT
      const userInfo = this.jwtAuth.authenticateConnection(req);
      if (!userInfo) {
        console.warn(`🔒 Unauthenticated WebSocket connection attempt from ${realIP}`);
        this.jwtAuth.logAuthEvent('connection_denied', null, `IP: ${realIP}`);
        ws.close(1008, 'Authentication required');
        return;
      }
      
      // Check if user has permission for audio streams
      if (!this.jwtAuth.hasAudioStreamPermission(userInfo)) {
        console.warn(`🔒 User ${userInfo.email} lacks audio stream permissions`);
        this.jwtAuth.logAuthEvent('permission_denied', userInfo, 'audio_streams');
        ws.close(1008, 'Insufficient permissions');
        return;
      }
      
      const clientInfo = {
        id: clientId,
        ip: realIP,
        userAgent: (req && req.headers && req.headers['user-agent']) || 'unknown',
        user: userInfo
      };
      
      // Security: Check per-IP connection limits
      const currentConnections = this.connectionsByIP.get(clientInfo.ip) || 0;
      if (currentConnections >= this.MAX_CONNECTIONS_PER_IP) {
        console.warn(`🔒 Connection limit exceeded for IP ${clientInfo.ip}: ${currentConnections}/${this.MAX_CONNECTIONS_PER_IP}`);
        this.jwtAuth.logAuthEvent('rate_limit_exceeded', userInfo, `IP: ${clientInfo.ip}`);
        ws.close(1008, 'Connection limit exceeded');
        return;
      }
      
      // Update connection count for this IP
      this.connectionsByIP.set(clientInfo.ip, currentConnections + 1);
      
      // Store client with user information
      this.clients.set(clientId, { ws: ws, user: userInfo });
      this.subscriptions.set(clientId, new Set());
      this.audioSubscriptions.set(clientId, new Set());
      
      // Store client IP for cleanup
      ws._clientIP = clientInfo.ip;
      
      console.log(`📱 Authenticated client ${clientId} (${userInfo.name}) connected from ${clientInfo.ip}. Total clients: ${this.clients.size}`);
      console.log(`🔍 Client details:`, clientInfo);
      console.log(`📊 IP ${clientInfo.ip} connections: ${this.connectionsByIP.get(clientInfo.ip)}/${this.MAX_CONNECTIONS_PER_IP}`);
      
      // Log successful authentication
      this.jwtAuth.logAuthEvent('connection_authenticated', userInfo, `IP: ${realIP}`);
      
      ws.on('message', (message) => {
        try {
          // Security: Limit message size to prevent DoS
          if (message.length > 1024) { // 1KB limit for JSON messages
            console.warn(`⚠️ Oversized message from client ${clientId}: ${message.length} bytes`);
            this.sendToClient(clientId, { type: 'error', message: 'Message too large' });
            return;
          }

          const data = JSON.parse(message.toString());
          this.handleClientMessage(clientId, data);
        } catch (error) {
          console.error(`❌ Invalid message from client ${clientId}:`, error.message);
          this.sendToClient(clientId, { type: 'error', message: 'Invalid message format' });
        }
      });
      
      ws.on('close', () => {
        console.log(`📱 Client ${clientId} disconnected`);
        this.cleanupClient(clientId);
      });
      
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
        this.cleanupClient(clientId);
      });
      
      // Send welcome message with user info
      this.sendToClient(clientId, {
        type: 'connected',
        clientId: clientId,
        user: {
          name: userInfo.name,
          email: userInfo.email,
          permissions: userInfo.permissions
        },
        availableStreams: Array.from(this.meterData.keys())
      });
    });
  }

  handleClientMessage(clientId, message) {
    const { type, device, channel } = message;
    
    // Security: Validate message structure and input parameters
    if (!type || typeof type !== 'string') {
      console.warn(`⚠️ Invalid message type from client ${clientId}`);
      this.sendToClient(clientId, { type: 'error', message: 'Invalid message format' });
      return;
    }

    // Validate device and channel for subscription operations
    if ((type === 'subscribe' || type === 'unsubscribe' || type === 'subscribe_audio' || type === 'unsubscribe_audio') && (device || channel)) {
      console.log(`🔍 Processing ${type} request from client ${clientId}: device=${device} (${typeof device}), channel=${channel} (${typeof channel})`);
      
      const sanitizedDevice = this.sanitizeInput(device, 'device');
      const sanitizedChannel = this.sanitizeInput(channel, 'channel');
      
      if (!sanitizedDevice || !sanitizedChannel) {
        console.warn(`⚠️ Invalid device/channel from client ${clientId}: ${device}:${channel}`);
        console.log(`🔍 Sanitization results: device=${sanitizedDevice}, channel=${sanitizedChannel}`);
        this.sendToClient(clientId, { type: 'error', message: 'Invalid device or channel format' });
        return;
      }

      console.log(`✅ Input sanitized successfully: ${sanitizedDevice}:${sanitizedChannel}`);
      
      if (!this.isAllowedDevice(sanitizedDevice)) {
        console.warn(`🔒 Unauthorized device access attempt from client ${clientId}: ${sanitizedDevice}`);
        console.log(`🔍 Device authorization check failed for: ${sanitizedDevice}`);
        console.log(`🔍 Configured networks:`, this.allowedNetworks.map(n => n.originalCIDR));
        this.sendToClient(clientId, { type: 'error', message: 'Device not authorized' });
        return;
      }

      console.log(`✅ Device ${sanitizedDevice} authorized successfully`);

      // Use sanitized values for further processing
      message.device = sanitizedDevice;
      message.channel = sanitizedChannel;
    }
    
    switch (type) {
      case 'subscribe':
        this.subscribeClient(clientId, message.device, message.channel);
        break;
        
      case 'unsubscribe':
        this.unsubscribeClient(clientId, message.device, message.channel);
        break;
        
      case 'subscribe_audio':
        this.subscribeClientAudio(clientId, message.device, message.channel);
        break;
        
      case 'unsubscribe_audio':
        this.unsubscribeClientAudio(clientId, message.device, message.channel);
        break;
        
      case 'list_streams':
        this.sendToClient(clientId, {
          type: 'stream_list',
          streams: Array.from(this.meterData.keys())
        });
        break;
        
      default:
        console.warn(`⚠️  Unknown message type: ${type} from client ${clientId}`);
        this.sendToClient(clientId, { type: 'error', message: 'Unknown message type' });
    }
  }

  subscribeClient(clientId, device, channel) {
    const streamKey = `${device}:${channel}`;
    
    console.log(`📊 Processing subscription request: client ${clientId} → ${streamKey}`);
    
    // Check process limit
    if (this.audioProcessors.size >= this.MAX_CONCURRENT_PROCESSES) {
      console.warn(`⚠️  Maximum concurrent processes (${this.MAX_CONCURRENT_PROCESSES}) reached, rejecting subscription to ${streamKey}`);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Maximum concurrent streams reached'
      });
      return;
    }
    
    // Add to client's subscriptions
    this.subscriptions.get(clientId).add(streamKey);
    console.log(`✅ Added subscription ${streamKey} for client ${clientId}`);
    
    // Start audio processor if not already running
    if (!this.audioProcessors.has(streamKey)) {
      console.log(`🎤 Starting new audio processor for ${streamKey}`);
      this.startAudioProcessor(device, channel);
    } else {
      console.log(`🔄 Audio processor for ${streamKey} already running`);
    }
    
    // Send current data if available
    if (this.meterData.has(streamKey)) {
      console.log(`📊 Sending existing meter data for ${streamKey}`);
      this.sendToClient(clientId, {
        type: 'meter_data',
        device,
        channel,
        data: this.meterData.get(streamKey)
      });
    } else {
      console.log(`ℹ️  No existing meter data for ${streamKey}`);
    }
    
    console.log(`📊 Client ${clientId} subscribed to ${streamKey} successfully`);
  }

  unsubscribeClient(clientId, device, channel) {
    const streamKey = `${device}:${channel}`;
    
    // Remove from client's subscriptions
    this.subscriptions.get(clientId).delete(streamKey);
    
    // Check if any other clients are subscribed (both meter and audio)
    const hasOtherMeterSubscribers = Array.from(this.subscriptions.values())
      .some(subs => subs.has(streamKey));
    const hasOtherAudioSubscribers = Array.from(this.audioSubscriptions.values())
      .some(subs => subs.has(streamKey));
    
    // Stop processor if no more subscribers of any type
    if (!hasOtherMeterSubscribers && !hasOtherAudioSubscribers) {
      this.stopAudioProcessor(device, channel);
    }
    
    console.log(`📊 Client ${clientId} unsubscribed from ${streamKey}`);
  }

  subscribeClientAudio(clientId, device, channel) {
    const streamKey = `${device}:${channel}`;
    
    console.log(`🎵 Processing audio subscription request: client ${clientId} → ${streamKey}`);
    
    // Check process limit
    if (this.audioProcessors.size >= this.MAX_CONCURRENT_PROCESSES) {
      console.warn(`⚠️  Maximum concurrent processes (${this.MAX_CONCURRENT_PROCESSES}) reached, rejecting audio subscription to ${streamKey}`);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Maximum concurrent streams reached'
      });
      return;
    }
    
    // Add to client's audio subscriptions
    this.audioSubscriptions.get(clientId).add(streamKey);
    console.log(`✅ Added audio subscription ${streamKey} for client ${clientId}`);
    
    // Start audio processor if not already running
    if (!this.audioProcessors.has(streamKey)) {
      console.log(`🎤 Starting new audio processor for ${streamKey} (audio streaming)`);
      this.startAudioProcessor(device, channel);
    } else {
      console.log(`🔄 Audio processor for ${streamKey} already running, adding audio streaming`);
    }
    
    // Send confirmation
    this.sendToClient(clientId, {
      type: 'audio_subscribed',
      device,
      channel,
      streamKey
    });
    
    console.log(`🎵 Client ${clientId} subscribed to audio stream ${streamKey} successfully`);
  }

  unsubscribeClientAudio(clientId, device, channel) {
    const streamKey = `${device}:${channel}`;
    
    // Remove from client's audio subscriptions
    this.audioSubscriptions.get(clientId).delete(streamKey);
    
    // Check if any other clients are subscribed (both meter and audio)
    const hasOtherMeterSubscribers = Array.from(this.subscriptions.values())
      .some(subs => subs.has(streamKey));
    const hasOtherAudioSubscribers = Array.from(this.audioSubscriptions.values())
      .some(subs => subs.has(streamKey));
    
    // Stop processor if no more subscribers of any type
    if (!hasOtherMeterSubscribers && !hasOtherAudioSubscribers) {
      this.stopAudioProcessor(device, channel);
    }
    
    console.log(`🎵 Client ${clientId} unsubscribed from audio ${streamKey}`);
  }

  startAudioProcessor(device, channel) {
    // Security: Final validation before spawning process (defense in depth)
    const sanitizedDevice = this.sanitizeInput(device, 'device');
    const sanitizedChannel = this.sanitizeInput(channel, 'channel');
    
    if (!sanitizedDevice || !sanitizedChannel || !this.isAllowedDevice(sanitizedDevice)) {
      console.error(`🔒 Security: Rejected invalid or unauthorized parameters: ${device}:${channel}`);
      return;
    }

    const streamKey = `${sanitizedDevice}:${sanitizedChannel}`;
    const port = 554 + (sanitizedChannel - 1);
    
    // Security: Construct RTSP URL with validated components only
    const rtspUrl = `rtsp://${sanitizedDevice}:${port}/stream.sdp`;
    
    console.log(`🎤 Starting audio processor for ${streamKey}`);
    console.log(`📡 RTSP URL: ${rtspUrl}`);
    
    // Create HLS storage directory for this device/channel
    const hlsStoragePath = `/tmp/hls-storage/${sanitizedDevice}/${sanitizedChannel}`;
    try {
      fs.mkdirSync(hlsStoragePath, { recursive: true });
      console.log(`📁 Created HLS storage: ${hlsStoragePath}`);
    } catch (error) {
      console.warn(`⚠️ Failed to create HLS storage directory: ${error.message}`);
    }
    
    // Security: Use pre-validated, sanitized arguments for FFmpeg
    // 
    // HLS VIDEO STREAMING OPTIMIZATION (January 2025):
    // =================================================
    // This dual-output configuration eliminates bandwidth duplication by using a single
    // RTSP stream from Pearl devices to provide BOTH audio meter data AND HLS video segments.
    // 
    // BANDWIDTH SAVINGS:
    // - Before: Separate RTSP streams for audio meters + video = 2x bandwidth
    // - After: Single RTSP stream serves both audio meters + HLS video = 50% bandwidth savings
    // 
    // PERFORMANCE OPTIMIZATIONS:
    // - Stream copying (no encoding): Minimal CPU usage
    // - Pearl device timing preserved: No forced frame rates or sync overrides
    // - LAN-optimized buffering: 4-second segments, 24-second total buffer
    // - Anti-jitter configuration: Tested to eliminate video stuttering
    // 
    // ARCHITECTURE:
    // - Audio Output: PCM data piped to existing meter processing (unchanged)
    // - HLS Output: MPEG-TS segments stored in shared Docker volume for Laravel access
    // - Timestamp Handling: Preserves original Pearl device timing for A/V sync
    //
    const ffmpegArgs = [
      // RTSP INPUT CONFIGURATION
      '-rtsp_transport', 'tcp',        // Force TCP for LAN reliability
      '-analyzeduration', '1000000',   // 1 second analysis (fast startup)
      '-probesize', '1000000',         // 1MB probe size (sufficient for Pearl streams)
      '-fflags', '+genpts',            // Generate presentation timestamps if missing
      '-i', rtspUrl,                   // Validated Pearl device RTSP URL
      
      // AUDIO OUTPUT STREAM (Existing Audio Meter Functionality)
      // This maintains 100% compatibility with existing audio meter system
      '-map', '0:a',                   // Map only audio stream for meters
      '-acodec', 'pcm_s16le',         // PCM 16-bit little-endian (required for meters)
      '-ar', '48000',                  // 48kHz sample rate (Pearl device standard)
      '-ac', '2',                      // Stereo output (left/right channels)
      '-f', 's16le',                   // Raw signed 16-bit format
      'pipe:1',                        // Output to stdout for existing meter processing
      
      // HLS VIDEO OUTPUT STREAM (New Bandwidth Optimization)
      // Provides video streaming without additional RTSP connection to Pearl device
      '-map', '0:v', '-map', '0:a',    // Map both video and audio for HLS output
      '-c:v', 'copy',                  // Copy H.264 video (no transcoding = minimal CPU)
      '-c:a', 'copy',                  // Copy audio (no transcoding = minimal CPU)
      
      // TIMESTAMP PRESERVATION (Critical for Audio/Video Sync)
      '-copyts',                       // Preserve original Pearl device timestamps
      '-avoid_negative_ts', 'disabled', // Don't modify timestamps (respect device timing)
      
      // HLS CONFIGURATION (LAN-Optimized for Local Network Deployment)
      '-f', 'hls',                     // HTTP Live Streaming format
      '-hls_time', '4',                // 4-second segments (keyframe-aligned, anti-jitter)
      '-hls_list_size', '6',           // Keep 6 segments = 24 seconds buffer (LAN appropriate)
      '-hls_flags', 'delete_segments+omit_endlist', // Auto-cleanup old segments, live stream
      '-hls_segment_type', 'mpegts',   // MPEG-TS container (web browser compatible)
      '-hls_allow_cache', '0',         // Disable caching (real-time streaming)
      `${hlsStoragePath}/stream.m3u8`  // HLS playlist file (shared Docker volume)
    ];
    
    console.log(`🎤 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Set up process timeout and health monitoring
    let lastDataTime = Date.now();
    let isHealthy = true;
    
    // Monitor process health
    const healthCheck = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTime;
      if (timeSinceLastData > 15000) { // 15 seconds without data
        console.warn(`⚠️  FFmpeg ${streamKey} appears stalled, restarting...`);
        isHealthy = false;
        this.cleanupHealthCheck(streamKey);
        ffmpeg.kill('SIGTERM');
        setTimeout(() => {
          if (this.audioProcessors.has(streamKey)) {
            this.audioProcessors.delete(streamKey);
            this.quasiPeakStates.delete(streamKey);
            // Client will automatically retry via recovery system
          }
        }, 1000);
      }
    }, 5000); // Check every 5 seconds
    
    // Store health check reference in managed collection
    this.healthCheckTimers.set(streamKey, healthCheck);
    
    // Buffer for audio data analysis with bounds checking
    let audioBuffer = Buffer.alloc(0);
    const sampleRate = 48000;  // Match FFmpeg setting (48kHz)
    const channels = 2;        // Match FFmpeg setting (stereo)
    const bytesPerSample = 2;  // s16le = 2 bytes per sample
    const samplesPerUpdate = Math.floor(sampleRate * 0.1); // 100ms updates
    const bytesPerUpdate = samplesPerUpdate * channels * bytesPerSample;
    const maxBufferSize = bytesPerUpdate * 5; // Limit buffer to 500ms max
    
    // Initialize quasi-peak detector state for this stream
    this.initQuasiPeakDetector(streamKey, channels);
    
    ffmpeg.stdout.on('data', (chunk) => {
      if (!isHealthy) return; // Ignore data if marked unhealthy
      
      lastDataTime = Date.now(); // Update health timestamp
      audioBuffer = Buffer.concat([audioBuffer, chunk]);
      
      // Prevent unbounded buffer growth
      if (audioBuffer.length > maxBufferSize) {
        console.warn(`⚠️  Audio buffer overflow for ${streamKey}, dropping old data`);
        audioBuffer = audioBuffer.subarray(audioBuffer.length - maxBufferSize);
      }
      
      // Process complete frames
      while (audioBuffer.length >= bytesPerUpdate) {
        const frameData = audioBuffer.subarray(0, bytesPerUpdate);
        audioBuffer = audioBuffer.subarray(bytesPerUpdate);
        
        const meterData = this.processAudioFramePPM(streamKey, frameData, channels);
        this.updateMeterData(sanitizedDevice, sanitizedChannel, meterData);
        
        // Also broadcast raw audio data to audio subscribers
        this.broadcastAudioData(streamKey, frameData, sanitizedDevice, sanitizedChannel);
      }
    });
    
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Only log important FFmpeg messages, not routine status updates
      if (output.includes('error') || output.includes('Error') || 
          output.includes('warning') || output.includes('Warning') ||
          output.includes('failed') || output.includes('Failed') ||
          output.includes('timeout') || output.includes('Timeout')) {
        console.log(`🎤 FFmpeg ${streamKey}:`, output.trim());
      }
      
      // Still parse for any useful stats (keep existing functionality)
      this.parseFFmpegStats();
    });
    
    ffmpeg.on('error', (error) => {
      console.error(`❌ FFmpeg error for ${streamKey}:`, error.message);
      isHealthy = false;
      this.cleanupHealthCheck(streamKey);
      this.audioProcessors.delete(streamKey);
      this.quasiPeakStates.delete(streamKey);
    });
    
    ffmpeg.on('exit', (code, signal) => {
      console.log(`🎤 Audio processor ${streamKey} exited (code: ${code}, signal: ${signal})`);
      isHealthy = false;
      this.cleanupHealthCheck(streamKey);
      this.audioProcessors.delete(streamKey);
      this.quasiPeakStates.delete(streamKey);
      
      // Log reason for common exit codes
      if (code === 1) {
        console.log(`💡 ${streamKey}: FFmpeg exited normally (stream ended or error)`);
      } else if (code === 234) {
        console.log(`💡 ${streamKey}: FFmpeg protocol error (possibly network/RTSP issue)`);
      } else if (signal === 'SIGTERM') {
        console.log(`💡 ${streamKey}: FFmpeg terminated by system (health check or shutdown)`);
      }
    });
    
    this.audioProcessors.set(streamKey, ffmpeg);
  }

  processAudioFramePPM(streamKey, frameData, channels) {
    // Convert s16le buffer to normalized float values
    const samples = [];
    for (let i = 0; i < frameData.length; i += 2) {
      // Read 16-bit signed integer and normalize to -1 to 1
      const sample = frameData.readInt16LE(i) / 32768;
      samples.push(sample);
    }
    
    // For mono audio, just use single channel
    const channelData = channels === 1 ? [samples] : [[], []];
    
    if (channels === 2) {
      // Split stereo samples
      for (let i = 0; i < samples.length; i++) {
        channelData[i % channels].push(samples[i]);
      }
    }
    
    const meterData = {
      timestamp: Date.now(),
      channels: channelData.map((channelSamples, idx) => {
        const rms = this.calculateRMS(channelSamples);
        const quasiPeak = this.calculateQuasiPeak(streamKey, idx, channelSamples);
        
        return {
          channel: idx + 1,
          rms: this.linearToDb(rms),
          peak: this.linearToDb(quasiPeak), // PPM uses quasi-peak, not instantaneous
          level: Math.max(0, Math.min(100, (this.linearToDb(rms) + 60) * (5/3))) // -60dB to 0dB mapped to 0-100
        };
      })
    };
    
    return meterData;
  }

  calculateRMS(samples) {
    const sumSquares = samples.reduce((sum, sample) => sum + (sample * sample), 0);
    return Math.sqrt(sumSquares / samples.length);
  }

  calculatePeak(samples) {
    return Math.max(...samples.map(Math.abs));
  }
  
  initQuasiPeakDetector(streamKey, channels) {
    this.quasiPeakStates.set(streamKey, {
      channels: Array(channels).fill(0).map(() => ({
        envelope: 0,
        lastUpdate: Date.now()
      }))
    });
  }
  
  calculateQuasiPeak(streamKey, channelIndex, samples) {
    const state = this.quasiPeakStates.get(streamKey);
    if (!state || !state.channels[channelIndex]) {
      return this.calculatePeak(samples); // Fallback to instantaneous peak
    }
    
    const channelState = state.channels[channelIndex];
    const now = Date.now();
    channelState.lastUpdate = now;
    
    // Process each sample through quasi-peak detector
    for (const sample of samples) {
      const rectified = Math.abs(sample);
      
      if (rectified > channelState.envelope) {
        // Attack: Use attack coefficient for rising signal
        channelState.envelope += (rectified - channelState.envelope) * (1 - this.PPM_ATTACK_COEFF);
      } else {
        // Decay: Use decay coefficient for falling signal  
        channelState.envelope *= this.PPM_DECAY_COEFF;
      }
    }
    
    return channelState.envelope;
  }

  linearToDb(linear) {
    return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
  }

  parseFFmpegStats() {
    // Parse additional stats from FFmpeg stderr if needed
    // This can include frequency analysis, dynamic range, etc.
  }

  updateMeterData(device, channel, meterData) {
    const streamKey = `${device}:${channel}`;
    this.meterData.set(streamKey, meterData);
    
    // Broadcast to all subscribed clients
    this.broadcastToSubscribers(streamKey, {
      type: 'meter_data',
      device,
      channel,
      data: meterData
    });
  }

  broadcastToSubscribers(streamKey, message) {
    for (const [clientId, subscriptions] of this.subscriptions.entries()) {
      if (subscriptions.has(streamKey)) {
        this.sendToClient(clientId, message);
      }
    }
  }

  broadcastAudioData(streamKey, frameData, device, channel) {
    // Convert binary audio data to base64 for JSON transmission
    const audioDataBase64 = frameData.toString('base64');
    
    const audioMessage = {
      type: 'audio_data',
      device,
      channel,
      data: audioDataBase64,
      format: {
        sampleRate: 48000,
        channels: 2,
        bitsPerSample: 16,
        encoding: 'pcm_s16le'
      },
      timestamp: Date.now()
    };

    // Broadcast to all audio subscribers only
    for (const [clientId, audioSubscriptions] of this.audioSubscriptions.entries()) {
      if (audioSubscriptions.has(streamKey)) {
        this.sendToClient(clientId, audioMessage);
      }
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.ws && client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`❌ Failed to send to client ${clientId}:`, error);
        this.cleanupClient(clientId);
      }
    }
  }

  stopAudioProcessor(device, channel) {
    const streamKey = `${device}:${channel}`;
    const processor = this.audioProcessors.get(streamKey);
    
    if (processor) {
      console.log(`🛑 Stopping audio processor for ${streamKey}`);
      
      // Clean shutdown with escalation
      processor.kill('SIGTERM');
      
      // Force kill after 3 seconds if not terminated
      setTimeout(() => {
        if (this.audioProcessors.has(streamKey)) {
          console.warn(`⚠️  Force killing stubborn process: ${streamKey}`);
          processor.kill('SIGKILL');
        }
      }, 3000);
      
      this.cleanupHealthCheck(streamKey);
      this.audioProcessors.delete(streamKey);
      this.meterData.delete(streamKey);
      this.quasiPeakStates.delete(streamKey);
      
      // Cleanup HLS storage directory when stream stops
      const hlsStoragePath = `/tmp/hls-storage/${device}/${channel}`;
      try {
        if (fs.existsSync(hlsStoragePath)) {
          fs.rmSync(hlsStoragePath, { recursive: true, force: true });
          console.log(`🧹 Cleaned up HLS storage: ${hlsStoragePath}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup HLS storage: ${error.message}`);
      }
    }
  }
  
  cleanupHealthCheck(streamKey) {
    const timer = this.healthCheckTimers.get(streamKey);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(streamKey);
    }
  }

  cleanupClient(clientId) {
    const subscriptions = this.subscriptions.get(clientId);
    const audioSubscriptions = this.audioSubscriptions.get(clientId);
    
    if (subscriptions) {
      // Unsubscribe from all meter streams
      for (const subscription of subscriptions) {
        const [device, channel] = subscription.split(':');
        this.unsubscribeClient(clientId, device, channel);
      }
    }
    
    if (audioSubscriptions) {
      // Unsubscribe from all audio streams
      for (const subscription of audioSubscriptions) {
        const [device, channel] = subscription.split(':');
        this.unsubscribeClientAudio(clientId, device, channel);
      }
    }
    
    // Security: Decrement connection count for this client's IP
    const client = this.clients.get(clientId);
    if (client && client.ws && client.ws._clientIP) {
      const clientIP = client.ws._clientIP;
      const currentConnections = this.connectionsByIP.get(clientIP) || 0;
      if (currentConnections > 1) {
        this.connectionsByIP.set(clientIP, currentConnections - 1);
      } else {
        this.connectionsByIP.delete(clientIP);
      }
      console.log(`📊 IP ${clientIP} connections: ${this.connectionsByIP.get(clientIP) || 0}/${this.MAX_CONNECTIONS_PER_IP}`);
      
      // Log disconnection
      if (client.user) {
        this.jwtAuth.logAuthEvent('client_disconnected', client.user, `IP: ${clientIP}`);
      }
    }
    
    this.clients.delete(clientId);
    this.subscriptions.delete(clientId);
    this.audioSubscriptions.delete(clientId);
    
    console.log(`🧹 Cleaned up client ${clientId}. Remaining clients: ${this.clients.size}`);
  }

  generateClientId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  getStatus() {
    // Get client summary with user info
    const clientSummary = Array.from(this.clients.entries()).map(([clientId, clientData]) => ({
      clientId,
      user: clientData.user ? {
        name: clientData.user.name,
        email: clientData.user.email,
        userId: clientData.user.userId
      } : null,
      meterSubscriptions: Array.from(this.subscriptions.get(clientId) || []),
      audioSubscriptions: Array.from(this.audioSubscriptions.get(clientId) || [])
    }));

    return {
      connectedClients: this.clients.size,
      activeProcessors: this.audioProcessors.size,
      trackedStreams: this.meterData.size,
      maxConnectionsPerIP: this.MAX_CONNECTIONS_PER_IP,
      connectionsByIP: Object.fromEntries(this.connectionsByIP),
      clients: clientSummary,
      meterSubscriptions: Object.fromEntries(
        Array.from(this.subscriptions.entries()).map(([clientId, subs]) => [
          clientId, Array.from(subs)
        ])
      ),
      audioSubscriptions: Object.fromEntries(
        Array.from(this.audioSubscriptions.entries()).map(([clientId, subs]) => [
          clientId, Array.from(subs)
        ])
      )
    };
  }
}

// Start the service
const meterService = new AudioMeterService(3444);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Audio Meter Service...');
  
  // Stop all audio processors
  for (const [, processor] of meterService.audioProcessors.entries()) {
    processor.kill('SIGTERM');
  }
  
  // Close WebSocket server
  if (meterService.wss) {
    meterService.wss.close();
  }
  
  process.exit(0);
});

// Status endpoint via HTTP for debugging
import http from 'http';
const statusServer = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(meterService.getStatus(), null, 2));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

statusServer.listen(3445, () => {
  console.log('📊 Status server running on http://localhost:3445/status');
});

export default AudioMeterService;
