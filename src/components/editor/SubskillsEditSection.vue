<template>
  <div id="edit-view" class="is-hidden">
    <div class="level mt-4">
      <div class="level-left">
        <div class="level-item">
          <button type="button" class="button is-light" id="btn-back">
            <span class="icon"><i class="fas fa-arrow-left"></i></span>
            <span>Back to list</span>
          </button>
        </div>
      </div>
    </div>
    <h2 class="title is-5" id="edit-heading">Edit subskill</h2>

    <form id="skill-form" class="box">
      <h3 class="title is-6">Identity</h3>
      <div class="columns is-multiline">
        <div class="column is-half">
          <div class="field">
            <label class="label" for="f-id">Internal id</label>
            <div class="control">
              <input class="input" type="text" id="f-id" readonly />
            </div>
          </div>
        </div>
        <div class="column is-half">
          <div class="field">
            <label class="label" for="f-numericId">numericId</label>
            <div class="control">
              <input class="input" type="number" id="f-numericId" step="1" />
            </div>
          </div>
        </div>
        <div class="column is-half">
          <div class="field">
            <label class="label" for="f-displayName">displayName</label>
            <div class="control">
              <input class="input" type="text" id="f-displayName" />
            </div>
          </div>
        </div>
      </div>

      <h3 class="title is-6 mt-4">Subskill link</h3>
      <div class="columns is-multiline">
        <div class="column is-half">
          <div class="field">
            <label class="label" for="f-parentSkillId">parentSkillId</label>
            <div class="control">
              <input class="input" type="text" id="f-parentSkillId" placeholder="e.g. spellbind" />
            </div>
          </div>
        </div>
        <div class="column is-half">
          <div class="field">
            <label class="label" for="f-subskillLabel">subskillLabel</label>
            <div class="control">
              <input class="input" type="text" id="f-subskillLabel" placeholder="Subskill" />
            </div>
          </div>
        </div>
      </div>

      <h3 class="title is-6 mt-4">Text</h3>
      <div class="field">
        <label class="label" for="f-description">description</label>
        <div class="control">
          <textarea class="textarea" id="f-description" rows="1"></textarea>
        </div>
      </div>
      <div class="field">
        <label class="label" for="f-skillEffect">skillEffect</label>
        <div class="control">
          <textarea class="textarea" id="f-skillEffect" rows="6"></textarea>
        </div>
      </div>

      <h3 class="title is-6 mt-4">JSON (must be valid JSON arrays / object)</h3>
      <div class="field">
        <div class="level is-mobile mb-2">
          <div class="level-left">
            <div class="level-item">
              <label class="label mb-0" for="f-scalingConstants">scalingConstants</label>
            </div>
          </div>
          <div class="level-right">
            <div class="level-item">
              <div class="select is-small">
                <select
                  id="editor-scaling-stat-add"
                  aria-label="Append scalingConstants row for a stat in description or skillEffect"
                  title="Append row for a stat referenced as {{stat}} in description or skillEffect"
                >
                  <option value="">Add row for stat in text fields…</option>
                </select>
              </div>
            </div>
            <div class="level-item">
              <button type="button" class="button is-small is-light" id="btn-add-scaling-constant-row">
                Add scalingConstants row
              </button>
            </div>
          </div>
        </div>
        <textarea class="textarea is-family-monospace is-small" id="f-scalingConstants" rows="8" spellcheck="false"></textarea>
        <p class="help is-danger is-hidden" id="err-scalingConstants"></p>
      </div>

      <div class="field is-grouped mt-5">
        <div class="control">
          <button type="button" class="button is-primary" id="btn-apply">Apply to buffer</button>
        </div>
        <div class="control">
          <button type="button" class="button is-link is-light" id="btn-download-edit">Download subskills.json</button>
        </div>
      </div>
    </form>
  </div>
</template>

