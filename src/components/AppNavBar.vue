<script setup>
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isDev = import.meta.env.DEV;

function linkClass(name) {
  return ['navbar-item', { 'is-selected': route.name === name }];
}

onMounted(() => {
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-navbar-menu]');
  burger?.addEventListener('click', () => {
    burger.classList.toggle('is-active');
    menu?.classList.toggle('is-active');
  });
});
</script>

<template>
  <nav class="navbar is-fixed-top" role="navigation" aria-label="main navigation">
    <div class="navbar-brand">
      <router-link class="navbar-item" to="/">
        <strong>MedianDB</strong>
      </router-link>
      <a role="button" class="navbar-burger" aria-label="menu" aria-expanded="false" data-burger>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
      </a>
    </div>
    <div class="navbar-menu" data-navbar-menu>
      <div class="navbar-start">
        <router-link id="nav-all-skills" :class="linkClass('home')" to="/">
          <strong>Skills</strong>
        </router-link>
        <router-link id="nav-tree" :class="linkClass('planner')" to="/planner">
          <strong>Planner</strong>
        </router-link>
        <router-link v-if="isDev" :class="linkClass('editor')" to="/editor">
          <strong>Editor</strong>
        </router-link>
        <router-link v-if="isDev" :class="linkClass('subskillsEditor')" to="/editor/subskills">
          <strong>Subskills</strong>
        </router-link>
      </div>
      <div class="navbar-end">
        <div
          v-show="
            route.name === 'home' ||
              route.name === 'planner' ||
              route.name === 'editor' ||
              route.name === 'subskillsEditor'
          "
          class="navbar-item"
        >
          <div class="field is-horizontal is-align-items-center mb-0">
            <div class="field-label" :class="{ 'is-normal': route.name === 'editor' }">
              <label class="label" for="version-selector">Version:</label>
            </div>
            <div class="field-body">
              <div class="field">
                <div class="control">
                  <div class="select">
                    <select id="version-selector"></select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  border-bottom: 1px solid rgba(122, 122, 122, 122);
}
</style>
