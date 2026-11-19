/**
 * GitChain Live - WebSocket Client
 */
class LiveSocket {
  constructor(options = {}) {
    this.url = options.url || `ws://${window.location.host}`;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 5000;
    this.listeners = new Map();
    this.isConnected = false;
  }

  connect() {
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('status', { connected: true });
        console.log('[LiveSocket] Connected to GitChain server');
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type, data);
        } catch (err) {
          console.error('[LiveSocket] Error parsing message:', err);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.emit('status', { connected: false });
        this.scheduleReconnect();
      };

      this.socket.onerror = (error) => {
        console.warn('[LiveSocket] WebSocket error:', error);
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        callback(data);
      }
    }
  }
}

window.liveSocket = new LiveSocket();
