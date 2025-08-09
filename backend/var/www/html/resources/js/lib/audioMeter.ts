// audioMeter.ts — Fixed vertical orientation (red at top, green at bottom)

export function setupAudioMeter(
  audioContext: AudioContext,
  sourceNode: AudioNode,
  canvas: HTMLCanvasElement,
  labelContainer?: HTMLElement,
  height: number = 150
) {
  const WIDTH = canvas.width = 24;
  const HEIGHT = canvas.height = height;
  const ctx = canvas.getContext('2d')!; // Assert non-null with !
  
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect(analyser);

  const dataArray = new Float32Array(analyser.fftSize);

  const dbMax = 0;
  const dbMin = -60;
  let peakHoldDb = dbMin;
  let peakHoldTime = 0;
  const PEAK_HOLD_DURATION = 2000;

  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  // Corrected order: red (top) → yellow → green (bottom)
  gradient.addColorStop(0.0, '#f00');   // 0 dB
  gradient.addColorStop(0.15, '#f00');  // -9 dB
  gradient.addColorStop(0.15, '#ff0');  // yellow start
  gradient.addColorStop(0.3, '#ff0');   // -18 dB
  gradient.addColorStop(0.3, '#0f0');   // green start
  gradient.addColorStop(1.0, '#0f0');   // -60 dB

  const peakDisplay = document.createElement('div');
  peakDisplay.style.fontSize = '0.7rem';
  peakDisplay.style.textAlign = 'center';
  peakDisplay.style.marginTop = '0.2rem';
  peakDisplay.textContent = `${dbMin.toFixed(1)} dB`;
  if (labelContainer) labelContainer.appendChild(peakDisplay);

  let animationFrame: number;

  function drawMeter(timestamp: number) {
    analyser.getFloatTimeDomainData(dataArray);

    let peak = 0;
    for (let i = 0; i < dataArray.length; i++) {
      peak = Math.max(peak, Math.abs(dataArray[i]));
    }

    let db = 20 * Math.log10(peak || 0.00001); // avoid -Infinity
    db = Math.max(dbMin, Math.min(dbMax, db));
    const percent = (db - dbMin) / (dbMax - dbMin);
    const fillHeight = percent * HEIGHT;

    if (db > peakHoldDb || timestamp - peakHoldTime > PEAK_HOLD_DURATION) {
      peakHoldDb = db;
      peakHoldTime = timestamp;
    }

    const peakPercent = (peakHoldDb - dbMin) / (dbMax - dbMin);
    const peakY = HEIGHT - peakPercent * HEIGHT;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, HEIGHT - fillHeight, WIDTH, fillHeight);

    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, peakY);
    ctx.lineTo(WIDTH, peakY);
    ctx.stroke();

    peakDisplay.textContent = `${peakHoldDb.toFixed(1)} dB`;

    animationFrame = requestAnimationFrame(drawMeter);
  }

  if (labelContainer) {
    const scale = document.createElement('div');
    scale.style.display = 'flex';
    scale.style.flexDirection = 'column';
    scale.style.alignItems = 'flex-end';
    scale.style.gap = '0.3rem';
    for (let i = dbMax; i >= dbMin; i -= 12) {
      const div = document.createElement('div');
      div.textContent = `${i} dB`; 
      div.style.fontSize = '0.6rem';
      div.style.textAlign = 'right';
      div.style.height = '20px';
      scale.appendChild(div);
    }
    labelContainer.insertBefore(scale, peakDisplay);
  }

  drawMeter(performance.now());

  // Return cleanup function
  return () => {
    cancelAnimationFrame(animationFrame);
    analyser.disconnect();
    if (labelContainer) {
      labelContainer.innerHTML = '';
    }
  };
}
