<script>
export default {
  name: 'CalculationsView',
};
</script>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const rows = ref(
  Array.from({ length: 60 }, (_, index) => ({
    level: index + 1,
    cost: '',
  }))
);

const results = ref([]);
let debounceTimer = null;

function toDataPoints(inputRows) {
  return inputRows
    .filter((row) => row.cost !== '' && row.cost !== null && row.cost !== undefined)
    .map((row) => ({
      lvl: row.level,
      cost: Number(row.cost),
    }))
    .filter((point) => Number.isInteger(point.cost))
    .sort((a, b) => a.lvl - b.lvl);
}

function solveManaParams(data) {
  if (!Array.isArray(data) || data.length < 2) {
    return [];
  }

  const solutions = [];

  for (let shift = 0; shift <= 32; shift += 1) {
    const factorNum = 256;
    const factorDen = 1 << shift;
    const points = [];
    let possible = true;

    for (const point of data) {
      const minVal = Math.ceil((point.cost * factorNum) / factorDen);
      const maxVal = Math.ceil(((point.cost + 1) * factorNum) / factorDen) - 1;

      if (minVal > maxVal) {
        possible = false;
        break;
      }

      points.push({
        lvl: point.lvl,
        min: minVal,
        max: maxVal,
      });
    }

    if (!possible) {
      continue;
    }

    let minB = -Infinity;
    let maxB = Infinity;

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const p1 = points[i];
        const p2 = points[j];
        const dlvl = p2.lvl - p1.lvl;

        if (dlvl <= 0) {
          continue;
        }

        const low = (p2.min - p1.max) / dlvl;
        const high = (p2.max - p1.min) / dlvl;
        minB = Math.max(minB, low);
        maxB = Math.min(maxB, high);
      }
    }

    if (!Number.isFinite(minB) || !Number.isFinite(maxB)) {
      continue;
    }

    const startB = Math.ceil(minB);
    const endB = Math.floor(maxB);

    if (startB > endB) {
      continue;
    }

    for (let b = startB; b <= endB; b += 1) {
      let minA = -Infinity;
      let maxA = Infinity;
      let validB = true;

      for (const point of points) {
        const term = b * (point.lvl - 1);
        const low = point.min - term;
        const high = point.max - term;
        minA = Math.max(minA, low);
        maxA = Math.min(maxA, high);

        if (minA > maxA) {
          validB = false;
          break;
        }
      }

      if (!validB) {
        continue;
      }

      const finalStartA = Math.ceil(minA);
      const finalEndA = Math.floor(maxA);

      if (finalStartA > finalEndA) {
        continue;
      }

      let chosenA = finalStartA;
      if (chosenA < 0 && finalEndA >= 0) {
        chosenA = 0;
      }

      solutions.push({
        min_mana: chosenA,
        lvl_mana: b,
        shift,
      });
    }
  }

  if (solutions.length === 0) {
    return [];
  }

  solutions.sort((a, b) => {
    const shiftDiff = Math.abs(a.shift - 8) - Math.abs(b.shift - 8);
    if (shiftDiff !== 0) {
      return shiftDiff;
    }
    const aIsNegative = a.min_mana < 0 ? 1 : 0;
    const bIsNegative = b.min_mana < 0 ? 1 : 0;
    if (aIsNegative !== bIsNegative) {
      return aIsNegative - bIsNegative;
    }
    return a.min_mana - b.min_mana;
  });

  return solutions.slice(0, 4);
}

function clearInputs() {
  for (const row of rows.value) {
    row.cost = '';
  }
  results.value = [];
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function runSolve() {
  const points = toDataPoints(rows.value);
  results.value = solveManaParams(points);
}

watch(
  rows,
  () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      runSolve();
    }, 500);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
});

const topSolutions = computed(() => {
  if (!Array.isArray(results.value) || results.value.length === 0) {
    return Array.from({ length: 4 }, () => null);
  }
  const out = [...results.value];
  while (out.length < 4) {
    out.push(null);
  }
  return out;
});
</script>

<template>
  <section class="section calculations-page">
    <div class="container">
      <div class="is-flex is-justify-content-space-between is-align-items-center mb-4">
        <h1 class="title mb-0">Calculations</h1>
        <button class="button is-danger is-outlined is-inverted" type="button" @click="clearInputs">
          Clear Inputs
        </button>
      </div>

      <div class="box output-box mb-4">
        <p class="heading mb-2">Top Parameter Sets</p>
        <div class="table-container">
          <table class="table is-fullwidth is-striped is-narrow">
            <thead>
              <tr>
                <th>#</th>
                <th>Min Mana (initial)</th>
                <th>Lvl Mana</th>
                <th>Shift</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in topSolutions" :key="index">
                <td>{{ index + 1 }}</td>
                <td>{{ item ? item.min_mana : '-' }}</td>
                <td>{{ item ? item.lvl_mana : '-' }}</td>
                <td>{{ item ? item.shift : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="box">
        <div class="table-container">
          <table class="table is-fullwidth is-striped is-hoverable is-narrow">
            <thead>
              <tr>
                <th>Level</th>
                <th>Mana Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.level">
                <td>{{ row.level }}</td>
                <td>
                  <input
                    v-model="row.cost"
                    class="input is-small"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 12"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.calculations-page {
  padding-top: 1rem;
}

.output-box {
  min-height: 11rem;
}

.table-container {
  max-height: 70vh;
  overflow: auto;
}
</style>
