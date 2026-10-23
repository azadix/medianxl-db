<script setup>
import { computed } from 'vue';
import { getAssetUrl } from '@/shared/utils.js';
import { YARD_HELPER, YARD_RING_FOCUS, YARD_RING_STEPS, buildYardOverlay } from '@/speedcalc/yard-overlay.js';

const rings = computed(() => buildYardOverlay());
const imageSrc = computed(() => getAssetUrl(YARD_HELPER.src));
const viewBox = `${0} ${0} ${YARD_HELPER.width} ${YARD_HELPER.height}`;
</script>

<template>
  <div class="speedcalc-yard-map">
    <header class="speedcalc-yard-head">
      <div>
        <h2 class="speedcalc-yard-title">Distance reference</h2>
        <p class="speedcalc-yard-subtitle">
          {{ YARD_RING_FOCUS }} yards from the character's feet, as isometric circles.
        </p>
      </div>
      <div class="speedcalc-yard-legend" aria-hidden="true">
        <span v-for="yards in YARD_RING_STEPS" :key="yards" class="speedcalc-yard-chip" :class="{ 'is-focus': yards === YARD_RING_FOCUS }">
          {{ yards }} yd
        </span>
      </div>
    </header>
    <div class="speedcalc-yard-stage">
      <img :src="imageSrc" alt="Character with isometric yard rings" class="speedcalc-yard-photo" width="1024" height="764">
      <svg class="speedcalc-yard-svg" :viewBox="viewBox" aria-hidden="true">
        <ellipse
          v-for="ring in rings"
          :key="'r' + ring.yards"
          :cx="ring.cx"
          :cy="ring.cy"
          :rx="ring.rx"
          :ry="ring.ry"
          fill="none"
          :class="ring.focus ? 'is-focus' : 'is-ring'"
        />
        <template v-for="ring in rings" :key="'l' + ring.yards">
          <text :x="ring.right[0] + 6" :y="ring.right[1] + 4" class="yard-label">{{ ring.yards }}</text>
          <text :x="ring.left[0] - 6" :y="ring.left[1] + 4" class="yard-label yard-label-left">{{ ring.yards }}</text>
          <text :x="ring.top[0]" :y="ring.top[1] - 6" class="yard-label yard-label-top">{{ ring.yards }}</text>
          <text :x="ring.bottom[0]" :y="ring.bottom[1] + 14" class="yard-label yard-label-top">{{ ring.yards }}</text>
        </template>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.speedcalc-yard-map {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}
.speedcalc-yard-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.speedcalc-yard-title {
  font-size: 1rem;
  font-weight: 700;
}
.speedcalc-yard-subtitle {
  margin-top: 0.2rem;
  font-size: 0.82rem;
  color: var(--bulma-text-weak, #a8adb8);
}
.speedcalc-yard-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
}
.speedcalc-yard-chip {
  padding: 0.18rem 0.5rem;
  border: 1px solid rgba(125, 255, 125, 0.35);
  border-radius: 999px;
  color: #9eff9e;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}
.speedcalc-yard-chip.is-focus {
  background: rgba(125, 255, 125, 0.16);
  border-color: rgba(125, 255, 125, 0.7);
}
.speedcalc-yard-stage {
  position: relative;
}
.speedcalc-yard-photo {
  display: block;
  width: 100%;
  height: auto;
}
.speedcalc-yard-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.is-ring {
  stroke: #3dcc3d;
  stroke-width: 1.5;
  opacity: 0.85;
}
.is-focus {
  stroke: #7dff7d;
  stroke-width: 3;
}
.yard-label {
  fill: #9eff9e;
  font-size: 14px;
  font-weight: 700;
  paint-order: stroke;
  stroke: #000;
  stroke-width: 3px;
}
.yard-label-left {
  text-anchor: end;
}
.yard-label-top {
  text-anchor: middle;
}
@media (max-width: 640px) {
  .speedcalc-yard-head {
    flex-direction: column;
  }
  .speedcalc-yard-legend {
    justify-content: flex-start;
  }
}
</style>
