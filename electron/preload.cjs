const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('native', {
  secureGet: () => ipcRenderer.invoke('secure:get'),
  secureSet: (value) => ipcRenderer.invoke('secure:set', value),
  setFullscreen: (on) => ipcRenderer.invoke('win:setFullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('win:isFullscreen'),
  discover: () => ipcRenderer.invoke('discover'),
  onFullscreen: (callback) => subscribe('win:fullscreen', callback),
  player: {
    available: () => ipcRenderer.invoke('player:available'),
    wakeAudio: () => ipcRenderer.invoke('audio:wake'),
    audioDevices: () => ipcRenderer.invoke('player:audio-devices'),
    open: (params) => ipcRenderer.invoke('player:open', params),
    close: () => ipcRenderer.invoke('player:close'),
    params: () => ipcRenderer.invoke('player:params'),
    load: (url, start) => ipcRenderer.invoke('mpv:load', url, start),
    command: (name, ...args) => ipcRenderer.invoke('mpv:command', name, ...args),
    onEvent: (callback) => subscribe('mpv:event', callback),
    onClosed: (callback) => subscribe('player:closed', callback),
  },
});
