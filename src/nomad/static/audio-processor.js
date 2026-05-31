class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel); // Float32Array chunk
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
