<script>
export default {
  name: 'SkillVizView',
};
</script>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getAssetUrl } from '@/shared/utils.js';
import patterns from '@/skill-viz/patterns.json';

const BARBARIAN_SKILLS = (patterns.skills || [])
  .filter((row) => row.class === 'Barbarian')
  .slice()
  .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));

const route = useRoute();
const router = useRouter();
const replayKey = ref(0);
const gifMissing = ref(false);

const skillId = computed(() => {
  const raw = route.query.skill;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && BARBARIAN_SKILLS.some((row) => row.id === value)) return value;
  return BARBARIAN_SKILLS[0]?.id || '';
});

const pattern = computed(
  () => BARBARIAN_SKILLS.find((row) => row.id === skillId.value) || null
);

const generateCmd = computed(() =>
  skillId.value
    ? `python tools/skill_viz/generate.py --skill ${skillId.value}`
    : 'python tools/skill_viz/generate.py --class Barbarian'
);

const gifHref = computed(() =>
  skillId.value ? getAssetUrl(`skill_viz/${skillId.value}.gif`) : ''
);

const gifSrc = computed(() => {
  if (!gifHref.value) return '';
  return `${gifHref.value}?r=${replayKey.value}`;
});

const gifName = computed(() => `${skillId.value}.gif`);

const subtitle = computed(() => {
  if (!pattern.value) return 'Barbarian missile GIFs (dev)';
  const heading = pattern.value.heading ? ` ${pattern.value.heading}` : '';
  return `${pattern.value.displayName} — ${pattern.value.kind}${heading}`;
});

function replay() {
  gifMissing.value = false;
  replayKey.value += 1;
}

function onSkillChange(event) {
  const value =
    event.target instanceof HTMLSelectElement ? event.target.value : skillId.value;
  gifMissing.value = false;
  replayKey.value += 1;
  router.replace({ query: { ...route.query, skill: value } });
}

function onGifError() {
  gifMissing.value = true;
}

function onGifLoad() {
  gifMissing.value = false;
}

watch(skillId, () => {
  gifMissing.value = false;
});
</script>

<template>
  <section class="section skill-viz-view">
    <div class="container">
      <h1 class="title is-4">Skill viz</h1>
      <p class="subtitle is-6">{{ subtitle }}</p>
      <div class="field is-grouped skill-viz-controls">
        <div class="control">
          <div class="select">
            <select :value="skillId" aria-label="Skill" @change="onSkillChange">
              <option v-for="row in BARBARIAN_SKILLS" :key="row.id" :value="row.id">
                {{ row.displayName }}
              </option>
            </select>
          </div>
        </div>
        <div class="control">
          <button type="button" class="button" :disabled="gifMissing || !skillId" @click="replay">
            Replay
          </button>
        </div>
        <div class="control">
          <a
            v-if="gifHref && !gifMissing"
            class="button"
            :href="gifHref"
            :download="gifName"
          >
            Download GIF
          </a>
        </div>
      </div>
      <div v-if="gifMissing" class="notification is-warning">
        GIF not found. Generate it with
        <code>{{ generateCmd }}</code>
      </div>
      <div v-else-if="!BARBARIAN_SKILLS.length" class="notification">
        No Barbarian patterns in patterns.json.
      </div>
      <div class="skill-viz-stage">
        <img
          v-if="gifSrc && !gifMissing"
          :src="gifSrc"
          class="skill-viz-gif"
          :alt="pattern?.displayName || skillId"
          @error="onGifError"
          @load="onGifLoad"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.skill-viz-controls {
  margin-bottom: 1rem;
}

.skill-viz-stage {
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 22rem;
  border-radius: 8px;
  overflow: hidden;
}

.skill-viz-gif {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  width: min(100%, 42rem);
  height: auto;
}
</style>
