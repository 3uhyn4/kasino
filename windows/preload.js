'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kasino', {
  quit: () => ipcRenderer.send('quit'),
  setTooltip: text => ipcRenderer.send('tooltip', text),
});
