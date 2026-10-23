<script setup>
import { computed, ref } from 'vue';
import { ITEM_FRW_MAX } from '@/speedcalc/movement-speed.js';

const props = defineProps({
  walk: { type: Array, default: () => [] },
  sprint: { type: Array, default: () => [] },
  currentItemFrw: { type: Number, default: 0 },
});

const WIDTH = 720;
const HEIGHT = 280;
const PAD = { l: 52, r: 18, t: 18, b: 40 };
const viewBox = `0 0 ${WIDTH} ${HEIGHT}`;

const hoverFrw = ref(null);
const tooltip = ref(null);
const plotWidth = WIDTH - PAD.l - PAD.r;
const plotHeight = HEIGHT - PAD.t - PAD.b;

function formatYards(n) {
  return (Math.floor(n * 100) / 100).toFixed(2);
}

const maxFrw = computed(() => {
  const last = props.walk[props.walk.length - 1] || props.sprint[props.sprint.length - 1];
  return last ? last.itemFrw : ITEM_FRW_MAX;
});

const yRange = computed(() => {
  const vals = [...props.walk, ...props.sprint].map((p) => p.yardsPerSec);
  if (!vals.length) return { min: 0, max: 20 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max(0.5, (max - min) * 0.08);
  return { min: Math.max(0, min - pad), max: max + pad };
});

function xPos(frw) {
  const cap = maxFrw.value || 1;
  return PAD.l + (frw / cap) * plotWidth;
}

function yPos(yards) {
  const { min, max } = yRange.value;
  const span = max - min || 1;
  return PAD.t + (1 - (yards - min) / span) * plotHeight;
}

function polyline(points) {
  return points.map((p) => `${xPos(p.itemFrw).toFixed(2)},${yPos(p.yardsPerSec).toFixed(2)}`).join(' ');
}

const walkLine = computed(() => polyline(props.walk));
const sprintLine = computed(() => polyline(props.sprint));

const xTicks = computed(() => {
  const cap = maxFrw.value;
  const step = cap >= 400 ? 100 : 50;
  const ticks = [];
  for (let v = 0; v <= cap; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== cap) ticks.push(cap);
  return ticks;
});

const yTicks = computed(() => {
  const { min, max } = yRange.value;
  const span = max - min || 1;
  const rough = span / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((n) => n * mag).find((n) => span / n <= 6) || mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
});

const currentFrw = computed(() => {
  const cap = maxFrw.value;
  return Math.min(cap, Math.max(0, Math.trunc(Number(props.currentItemFrw) || 0)));
});

function pointAt(series, frw) {
  return series[frw] || series.find((p) => p.itemFrw === frw) || null;
}

const hover = computed(() => {
  if (hoverFrw.value == null) return null;
  const frw = hoverFrw.value;
  return {
    frw,
    walk: pointAt(props.walk, frw),
    sprint: pointAt(props.sprint, frw),
  };
});

function frwFromEvent(event) {
  const svg = event.currentTarget;
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  const t = (x - PAD.l) / plotWidth;
  const cap = maxFrw.value;
  return Math.min(cap, Math.max(0, Math.round(t * cap)));
}

function onMove(event) {
  const frw = frwFromEvent(event);
  hoverFrw.value = frw;
  const svg = event.currentTarget;
  const rect = svg.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  tooltip.value = {
    left: localX > rect.width - 200 ? localX - 188 : localX + 12,
    top: localY < 56 ? localY + 28 : localY - 12,
  };
}

function onLeave() {
  hoverFrw.value = null;
  tooltip.value = null;
}
</script>

<template>
  <div class="speedcalc-graph">
    <svg
      class="speedcalc-graph-svg"
      :viewBox="viewBox"
      role="img"
      aria-label="Walk and sprint speed versus movement speed"
      @pointerdown="onMove"
      @pointermove="onMove"
      @pointerleave="onLeave"
    >
      <rect class="speedcalc-graph-bg" :x="PAD.l" :y="PAD.t" :width="plotWidth" :height="plotHeight" />
      <g class="speedcalc-graph-grid">
        <line
          v-for="tick in yTicks"
          :key="'gy' + tick"
          :x1="PAD.l"
          :x2="PAD.l + plotWidth"
          :y1="yPos(tick)"
          :y2="yPos(tick)"
        />
        <line
          v-for="tick in xTicks"
          :key="'gx' + tick"
          :x1="xPos(tick)"
          :x2="xPos(tick)"
          :y1="PAD.t"
          :y2="PAD.t + plotHeight"
        />
      </g>
      <polyline class="speedcalc-graph-line is-walk" fill="none" :points="walkLine" />
      <polyline class="speedcalc-graph-line is-sprint" fill="none" :points="sprintLine" />
      <line
        class="speedcalc-graph-now"
        :x1="xPos(currentFrw)"
        :x2="xPos(currentFrw)"
        :y1="PAD.t"
        :y2="PAD.t + plotHeight"
      />
      <template v-if="hover">
        <line
          class="speedcalc-graph-hover"
          :x1="xPos(hover.frw)"
          :x2="xPos(hover.frw)"
          :y1="PAD.t"
          :y2="PAD.t + plotHeight"
        />
        <circle v-if="hover.walk" class="is-walk" :cx="xPos(hover.frw)" :cy="yPos(hover.walk.yardsPerSec)" r="4" />
        <circle v-if="hover.sprint" class="is-sprint" :cx="xPos(hover.frw)" :cy="yPos(hover.sprint.yardsPerSec)" r="4" />
      </template>
      <g class="speedcalc-graph-axis">
        <text v-for="tick in yTicks" :key="'ly' + tick" :x="PAD.l - 8" :y="yPos(tick) + 3" text-anchor="end">
          {{ formatYards(tick) }}
        </text>
        <text v-for="tick in xTicks" :key="'lx' + tick" :x="xPos(tick)" :y="HEIGHT - 18" text-anchor="middle">
          {{ tick }}
        </text>
        <text :x="PAD.l + plotWidth / 2" :y="HEIGHT - 4" text-anchor="middle" class="speedcalc-graph-axis-title">
          Movement speed %
        </text>
        <text
          :x="14"
          :y="PAD.t + plotHeight / 2"
          text-anchor="middle"
          class="speedcalc-graph-axis-title"
          :transform="`rotate(-90 14 ${PAD.t + plotHeight / 2})`"
        >
          yards/s
        </text>
      </g>
    </svg>
    <div v-if="hover && tooltip" class="speedcalc-graph-tooltip" :style="{ left: tooltip.left + 'px', top: tooltip.top + 'px' }">
      <div class="speedcalc-graph-tooltip-title">{{ hover.frw }}% movement speed</div>
      <div v-if="hover.walk" class="is-walk">
        Walk {{ formatYards(hover.walk.yardsPerSec) }} yd/s · {{ hover.walk.frames }} frm
      </div>
      <div v-if="hover.sprint" class="is-sprint">
        Sprint {{ formatYards(hover.sprint.yardsPerSec) }} yd/s · {{ hover.sprint.frames }} frm
      </div>
    </div>
  </div>
</template>

<style scoped>
.speedcalc-graph {
  position: relative;
}
.speedcalc-graph-svg {
  display: block;
  width: 100%;
  height: auto;
  touch-action: none;
}
.speedcalc-graph-bg {
  fill: rgba(0, 0, 0, 0.18);
}
.speedcalc-graph-grid line {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}
.speedcalc-graph-line {
  fill: none;
  stroke-width: 2.25;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.speedcalc-graph-line.is-walk {
  stroke: #6ee7c8;
}
.speedcalc-graph-line.is-sprint {
  stroke: #ffcf6e;
}
circle.is-walk {
  fill: #6ee7c8;
  stroke: #6ee7c8;
}
circle.is-sprint {
  fill: #ffcf6e;
  stroke: #ffcf6e;
}
.speedcalc-graph-now {
  stroke: rgba(255, 255, 255, 0.35);
  stroke-dasharray: 4 4;
  stroke-width: 1.25;
}
.speedcalc-graph-hover {
  stroke: rgba(255, 255, 255, 0.55);
  stroke-width: 1;
}
.speedcalc-graph-axis text {
  fill: #a8adb8;
  font-size: 11px;
}
.speedcalc-graph-axis-title {
  fill: #c5c9d3;
  font-size: 11px;
}
.speedcalc-graph-tooltip {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  min-width: 11rem;
  padding: 0.45rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(18, 20, 26, 0.94);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  transform: translateY(-100%);
}
.speedcalc-graph-tooltip-title {
  margin-bottom: 0.25rem;
  font-weight: 700;
}
.speedcalc-graph-tooltip .is-walk {
  color: #6ee7c8;
}
.speedcalc-graph-tooltip .is-sprint {
  color: #ffcf6e;
}
</style>
