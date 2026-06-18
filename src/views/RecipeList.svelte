<script>
  import { listRecipes, supabase } from '../lib/supabase.js';
  import RecipeCard from '../components/RecipeCard.svelte';

  let {
    darkMode = false,
    onAdd,
    onDarkModeChange = () => {},
    onOpen,
  } = $props();

  let query = $state('');
  let recipes = $state([]);
  let loading = $state(false);
  let refreshing = $state(false);
  let pullDistance = $state(0);
  let error = $state('');
  let settingsOpen = $state(false);
  let searchTimeout = null;
  let touchStartY = 0;
  let pulling = false;

  $effect(() => {
    clearTimeout(searchTimeout);
    const currentQuery = query;
    searchTimeout = setTimeout(() => loadRecipes(currentQuery), 250);
    return () => clearTimeout(searchTimeout);
  });

  async function loadRecipes(currentQuery) {
    loading = true;
    error = '';
    try {
      recipes = await listRecipes(currentQuery);
    } catch (err) {
      error = err.message;
    }
    loading = false;
  }

  async function refreshRecipes() {
    refreshing = true;
    error = '';
    try {
      recipes = await listRecipes(query);
    } catch (err) {
      error = err.message;
    }
    refreshing = false;
    pullDistance = 0;
  }

  function handleTouchStart(event) {
    if (window.scrollY !== 0) return;
    touchStartY = event.touches[0].clientY;
    pulling = true;
  }

  function handleTouchMove(event) {
    if (!pulling || refreshing) return;
    const distance = event.touches[0].clientY - touchStartY;
    if (distance <= 0) {
      pullDistance = 0;
      return;
    }
    pullDistance = Math.min(distance * 0.45, 72);
  }

  function handleTouchEnd() {
    if (!pulling) return;
    pulling = false;
    if (pullDistance >= 56) {
      refreshRecipes();
    } else {
      pullDistance = 0;
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }
</script>

<main
  class="list-view"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  style={`--pull-distance: ${pullDistance}px`}
>
  <div class:visible={pullDistance > 8 || refreshing} class="pull-refresh">
    <div class:spin={refreshing} class="refresh-icon"></div>
    <span>{refreshing ? 'Refreshing' : 'Pull to refresh'}</span>
  </div>

  <div class="list-content">
    <header>
      <div>
        <p class="eyebrow">FoodIsLife</p>
        <h1>Recipes</h1>
      </div>
      <div class="header-actions">
        <button class="toolbar-button" onclick={() => settingsOpen = true}>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6.9h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"></path>
          </svg>
          <span>Settings</span>
        </button>
        <button class="toolbar-button" onclick={logout}>Logout</button>
      </div>
    </header>

    <label class="search">
      <span class="sr-only">Search recipes</span>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7"></circle>
        <path d="m20 20-4-4"></path>
      </svg>
      <input type="search" placeholder="Search recipes" bind:value={query} />
    </label>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <section class="cards" aria-label="Recipe list">
      {#if loading && recipes.length === 0}
        <p class="status">Loading recipes...</p>
      {:else if recipes.length === 0}
        <p class="status">{query ? 'No matching recipes' : 'No recipes yet'}</p>
      {:else}
        {#each recipes as recipe (recipe.id)}
          <RecipeCard {recipe} {onOpen} />
        {/each}
      {/if}
    </section>
  </div>

  {#if settingsOpen}
    <div class="settings-layer">
      <button class="settings-backdrop" onclick={() => settingsOpen = false} aria-label="Close settings"></button>
      <div class="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="settings-head">
          <h2>Settings</h2>
          <button class="icon-close" onclick={() => settingsOpen = false} aria-label="Close settings">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <label class="setting-row">
          <span>Dark Mode</span>
          <input
            type="checkbox"
            checked={darkMode}
            onchange={(event) => onDarkModeChange(event.currentTarget.checked)}
          />
        </label>
      </div>
    </div>
  {/if}

  <button class="add" onclick={onAdd} aria-label="Add recipe">
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14"></path>
    </svg>
  </button>
</main>

<style>
  .list-view {
    min-height: 100dvh;
    width: min(760px, 100%);
    margin: 0 auto;
    padding: max(18px, env(safe-area-inset-top)) 16px 96px;
    touch-action: pan-y;
  }

  .list-content {
    transform: translateY(var(--pull-distance));
    transition: transform 0.18s ease;
  }

  .pull-refresh {
    position: fixed;
    top: max(8px, env(safe-area-inset-top));
    left: 50%;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-muted-strong);
    font-size: 13px;
    font-weight: 800;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -120%);
    transition: opacity 0.15s ease, transform 0.18s ease;
    box-shadow: var(--shadow-soft);
  }

  .pull-refresh.visible {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  .refresh-icon {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
  }

  .refresh-icon.spin {
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .eyebrow,
  h1 {
    margin: 0;
  }

  .eyebrow {
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
  }

  h1 {
    font-size: 30px;
    line-height: 1.1;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .toolbar-button {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-muted-strong);
    padding: 9px 12px;
    cursor: pointer;
  }

  .toolbar-button svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .settings-layer {
    position: fixed;
    inset: 0;
    z-index: 8;
    display: grid;
    align-items: end;
    padding: 16px;
  }

  .settings-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: var(--color-overlay);
    cursor: pointer;
  }

  .settings-panel {
    position: relative;
    z-index: 1;
    width: min(420px, 100%);
    margin: 0 auto;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    box-shadow: var(--shadow-floating);
  }

  .settings-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .settings-head h2 {
    margin: 0;
    font-size: 20px;
  }

  .icon-close {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .icon-close svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .setting-row {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    color: var(--color-text);
    font-weight: 800;
  }

  .setting-row input {
    width: 22px;
    height: 22px;
    accent-color: var(--color-accent);
    box-shadow: none;
    cursor: pointer;
  }

  .search {
    position: sticky;
    top: 8px;
    z-index: 2;
    display: block;
    margin-bottom: 16px;
  }

  .search svg {
    position: absolute;
    left: 14px;
    top: 50%;
    width: 19px;
    height: 19px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--color-muted);
    stroke-width: 2;
    stroke-linecap: round;
  }

  input {
    width: 100%;
    padding: 14px 14px 14px 44px;
    font-size: 16px;
    box-shadow: var(--shadow-input);
  }

  .cards {
    display: grid;
    gap: 12px;
  }

  .status,
  .error {
    margin: 48px 0 0;
    color: var(--color-muted);
    text-align: center;
  }

  .error {
    margin: 0 0 12px;
    color: var(--color-danger);
  }

  .add {
    position: fixed;
    right: max(18px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom));
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 50%;
    background: var(--color-surface-strong);
    color: var(--color-text-inverse);
    box-shadow: var(--shadow-floating);
    cursor: pointer;
    z-index: 6;
  }

  .add svg {
    width: 28px;
    height: 28px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }
</style>
