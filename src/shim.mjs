import * as kaizen from "./kaizen_bg.js";
import wasm from "./kaizen_bg.wasm";

// Initialize the Wasm module
const instance = await WebAssembly.instantiate(wasm, {
  "./kaizen_bg.js": kaizen,
});
kaizen.__wbg_set_wasm(instance.exports);

export default {
  async fetch(request, env, ctx) {
    return await kaizen.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    await kaizen.scheduled(event, env, ctx);
  },
};
