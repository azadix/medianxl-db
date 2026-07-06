<script>
export default {
  name: 'CalculationsView',
};
</script>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const LEVEL_COUNT = 60;
const INPUT_COLUMNS = 4;

const rows = ref(
  Array.from({ length: LEVEL_COUNT }, (_, index) => ({
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

const filledPointCount = computed(() => toDataPoints(rows.value).length);

const inputColumns = computed(() => {
  const perColumn = Math.ceil(LEVEL_COUNT / INPUT_COLUMNS);
  return Array.from({ length: INPUT_COLUMNS }, (_, columnIndex) =>
    rows.value.slice(columnIndex * perColumn, (columnIndex + 1) * perColumn)
  );
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

const hasEnoughPoints = computed(() => filledPointCount.value >= 2);
</script>

<template>
  <section class="section calculations-page">
    <div class="container calculations-page__container">
      <header class="calculations-page__header">
        <div>
          <h1 class="title is-4 mb-1">Calculations</h1>
          <p class="calculations-page__lede">
            Reverse-engineer scaling parameters from in-game values. More sections may be added later.
          </p>
        </div>
      </header>

      <article class="calc-section box">
        <header class="calc-section__header">
          <p class="calc-section__eyebrow">Section 1</p>
          <h2 class="calc-section__title">Mana cost parameters</h2>
          <p class="calc-section__desc">
            Enter mana costs at different skill levels. The solver infers
            <code>min_mana</code>, <code>lvl_mana</code>, and <code>shift</code> used in
            <code>mana_cost</code> scaling rows. At least two levels are required.
          </p>
        </header>

        <div class="calc-section__body">
          <div class="calc-mana-layout">
            <section class="calc-mana-results" aria-labelledby="mana-results-heading">
              <div class="calc-mana-results__head">
                <h3 id="mana-results-heading" class="calc-panel__title">Top parameter sets</h3>
                <span class="calc-mana-results__meta">
                  {{ filledPointCount }} sample{{ filledPointCount === 1 ? '' : 's' }}
                </span>
              </div>

              <div v-if="!hasEnoughPoints" class="calc-mana-results__hint notification">
                Add mana costs for at least two levels to see matches.
              </div>

              <div v-else class="table-container calc-mana-results__table">
                <table class="table is-fullwidth is-striped mb-0 calc-mana-results__table-inner">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Min mana</th>
                      <th>Lvl mana</th>
                      <th>Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, index) in topSolutions" :key="index">
                      <td>{{ index + 1 }}</td>
                      <td>{{ item ? item.min_mana : '—' }}</td>
                      <td>{{ item ? item.lvl_mana : '—' }}</td>
                      <td>{{ item ? item.shift : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="calc-mana-inputs" aria-labelledby="mana-inputs-heading">
              <div class="calc-mana-inputs__head">
                <h3 id="mana-inputs-heading" class="calc-panel__title">Level samples</h3>
                <button
                  class="button is-small is-danger is-inverted is-outlined"
                  type="button"
                  @click="clearInputs"
                >
                  Clear
                </button>
              </div>

              <div class="mana-input-grid">
                <div
                  v-for="(column, columnIndex) in inputColumns"
                  :key="columnIndex"
                  class="mana-input-col"
                >
                  <label
                    v-for="row in column"
                    :key="row.level"
                    class="mana-sample"
                    :title="`Skill level ${row.level}`"
                  >
                    <span class="mana-sample__level">{{ row.level }}</span>
                    <input
                      v-model="row.cost"
                      class="input mana-sample__input"
                      type="number"
                      min="0"
                      step="1"
                      :aria-label="`Mana cost at level ${row.level}`"
                      placeholder="—"
                    />
                  </label>
                </div>
              </div>
            </section>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.calculations-page {
  padding-top: 1rem;
  padding-bottom: 2rem;
}

.calculations-page__container {
  max-width: 960px;
}

.calculations-page__header {
  margin-bottom: 1.25rem;
}

.calculations-page__lede {
  color: var(--bulma-text-weak, #7a7a7a);
  font-size: 0.95rem;
  max-width: 42rem;
}

.calc-section {
  padding: 0;
  overflow: hidden;
}

.calc-section__header {
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--bulma-border-weak, #ededed);
  background: var(--bulma-scheme-main-bis, #fafafa);
}

.calc-section__eyebrow {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bulma-text-weak, #7a7a7a);
  margin-bottom: 0.35rem;
}

.calc-section__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.calc-section__desc {
  color: var(--bulma-text-weak, #7a7a7a);
  font-size: 0.9rem;
  max-width: 40rem;
  margin-bottom: 0;
}

.calc-section__desc code {
  font-size: 0.85em;
}

.calc-section__body {
  padding: 1.25rem 1.5rem 1.5rem;
}

.calc-mana-layout {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 1.5rem;
  align-items: start;
}

.calc-panel__title {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bulma-text-weak, #7a7a7a);
  margin: 0;
}

.calc-mana-results__head,
.calc-mana-inputs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.calc-mana-results__meta {
  font-size: 0.8rem;
  color: var(--bulma-text-weak, #7a7a7a);
  white-space: nowrap;
}

.calc-mana-results__hint {
  font-size: 0.85rem;
  padding: 0.65rem 0.75rem;
  margin: 0;
}

.calc-mana-results__table {
  border: 1px solid var(--bulma-border-weak, #ededed);
  border-radius: 4px;
}

.calc-mana-results__table-inner {
  font-size: 1rem;
}

.calc-mana-results__table-inner th,
.calc-mana-results__table-inner td {
  padding: 0.65em 0.85em;
}

.mana-input-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.2rem 0.35rem;
}

.mana-input-col {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.mana-sample {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: text;
}

.mana-sample__level {
  width: 1.6rem;
  flex-shrink: 0;
  text-align: right;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: var(--bulma-text-weak, #7a7a7a);
}

.mana-sample__input {
  width: 100%;
  max-width: 4.25rem;
  height: 1.65rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.82rem;
}

.mana-sample__input::placeholder {
  color: var(--bulma-text-weak, #dbdbdb);
}

@media screen and (max-width: 860px) {
  .calc-mana-layout {
    grid-template-columns: 1fr;
  }

  .mana-input-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media screen and (max-width: 480px) {
  .calc-section__header,
  .calc-section__body {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .mana-input-grid {
    grid-template-columns: 1fr;
  }
}
</style>
