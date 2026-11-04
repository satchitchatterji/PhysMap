import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioReactiveController } from '../src/audioReactive.js';

class FakeTrack {
  constructor(kind, label) {
    this.kind = kind;
    this.label = label;
    this.readyState = 'live';
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
    this.readyState = 'ended';
  }
}

class FakeStream {
  constructor(tracks) {
    this.tracks = tracks;
  }

  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
  getTracks() { return this.tracks; }
}

class FakeAudioContext {
  createAnalyser() {
    return {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 2,
      connect() {},
      getByteFrequencyData() {},
    };
  }

  createMediaStreamSource(stream) {
    assert.equal(stream.getVideoTracks().length, 0);
    assert.equal(stream.getAudioTracks().length, 1);
    return { connect() {}, disconnect() {} };
  }

  async resume() {}
  async close() {}
}

test('system capture does not request or mix microphone audio', async () => {
  const previousNavigator = globalThis.navigator;
  const previousWindow = globalThis.window;
  const previousMediaStream = globalThis.MediaStream;
  let microphoneRequests = 0;
  let displayRequests = 0;
  const displayStream = new FakeStream([
    new FakeTrack('video', 'Screen'),
    new FakeTrack('audio', 'System Audio'),
  ]);

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          microphoneRequests += 1;
          throw new Error('microphone should not be requested');
        },
        getDisplayMedia: async () => {
          displayRequests += 1;
          return displayStream;
        },
      },
    },
  });
  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.MediaStream = FakeStream;

  try {
    const controller = new AudioReactiveController();
    await controller.start('system');
    assert.equal(microphoneRequests, 0);
    assert.equal(displayRequests, 1);
    assert.equal(controller.describeCapture(), 'system audio (1 track)');
    await controller.stop();
    assert.equal(displayStream.getAudioTracks()[0].stopped, true);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
    globalThis.window = previousWindow;
    globalThis.MediaStream = previousMediaStream;
  }
});
