<script>
  import { onDestroy, onMount } from 'svelte';
  import MacroPanel from '../components/MacroPanel.svelte';
  import { addNote, getRecipe, listNotes } from '../lib/supabase.js';
  import {
    buildStepSegments,
    formatIngredientLine,
    formatTimestamp,
  } from '../lib/recipeUtils.js';

  let { recipeId, onBack, onEdit } = $props();

  let recipe = $state(null);
  let notes = $state([]);
  let currentServings = $state(1);
  let loading = $state(true);
  let error = $state('');
  let noteText = $state('');
  let savingNote = $state(false);
  let cookMode = $state(false);
  let wakeError = $state('');
  let wakeLock = null;

  let scale = $derived(recipe ? Number(currentServings || 1) / Number(recipe.base_servings || 1) : 1);

  onMount(load);

  onDestroy(() => {
    releaseWakeLock();
  });

  $effect(() => {
    async function handleVisibility() {
      if (cookMode && document.visibilityState === 'visible' && !wakeLock) {
        await requestWakeLock();
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  });

  async function load() {
    loading = true;
    error = '';
    try {
      recipe = await getRecipe(recipeId);
      currentServings = recipe.base_servings || 1;
      notes = await listNotes(recipeId);
    } catch (err) {
      error = err.message;
    }
    loading = false;
  }

  async function toggleCookMode() {
    if (cookMode) {
      cookMode = false;
      await releaseWakeLock();
      return;
    }

    cookMode = true;
    await requestWakeLock();
  }

  async function requestWakeLock() {
    wakeError = '';
    if (!('wakeLock' in navigator)) {
      wakeError = 'Wake lock is not supported in this browser.';
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (err) {
      wakeError = err.message;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    const current = wakeLock;
    wakeLock = null;
    try {
      await current.release();
    } catch {
      // The browser may already have released the lock.
    }
  }

  async function saveNote() {
    if (!noteText.trim()) return;
    savingNote = true;
    error = '';
    try {
      const saved = await addNote(recipeId, noteText.trim());
      notes = [saved, ...notes];
      noteText = '';
    } catch (err) {
      error = err.message;
    }
    savingNote = false;
  }

  function handleBack() {
    cookMode = false;
    releaseWakeLock();
    onBack();
  }
</script>

<main class="detail-view">
  <header>
    <button class="icon-button" onclick={handleBack} aria-label="Back to recipes">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m15 18-6-6 6-6"></path>
      </svg>
    </button>
    <h1>{recipe?.title || 'Recipe'}</h1>
    {#if recipe}
      <button class="icon-button" onclick={() => onEdit(recipe)} aria-label="Edit recipe">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 20h9"></path>
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path>
        </svg>
      </button>
    {:else}
      <span></span>
    {/if}
  </header>

  {#if loading}
    <p class="status">Loading recipe...</p>
  {:else if error && !recipe}
    <p class="status error">{error}</p>
  {:else if recipe}
    <section class="hero">
      <p>{formatTimestamp(recipe.created_at)}</p>
      <div class="servings">
        <span>Serves</span>
        <div class="stepper">
          <button onclick={() => currentServings = Math.max(1, Number(currentServings || 1) - 1)} aria-label="Decrease servings">-</button>
          <input type="number" min="1" step="1" bind:value={currentServings} />
          <button onclick={() => currentServings = Number(currentServings || 1) + 1} aria-label="Increase servings">+</button>
        </div>
      </div>
      <button class:active={cookMode} class="cook" onclick={toggleCookMode}>
        {cookMode ? 'Cook mode on' : 'Cook mode'}
      </button>
      {#if wakeError}
        <p class="wake-error">{wakeError}</p>
      {/if}
    </section>

    <MacroPanel macroEstimate={recipe.macro_estimate} />

    <section class="section">
      <h2>Ingredients</h2>
      {#if recipe.ingredients?.length}
        <ul class="ingredients">
          {#each recipe.ingredients as ingredient}
            <li>{formatIngredientLine(ingredient, scale)}</li>
          {/each}
        </ul>
      {:else}
        <p class="muted">No ingredients yet</p>
      {/if}
    </section>

    <section class="section">
      <h2>Procedure</h2>
      {#if recipe.steps?.length}
        <ol class="steps">
          {#each recipe.steps as step}
            <li>
              <p>
                {#each buildStepSegments(step, recipe.ingredients || [], scale) as segment}
                  {#if segment.bold}<strong>{segment.text}</strong>{:else}{segment.text}{/if}
                {/each}
              </p>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted">No steps yet</p>
      {/if}
    </section>

    <section class="section notes">
      <h2>Notes</h2>
      <div class="note-form">
        <textarea rows="3" placeholder="Add a note" bind:value={noteText}></textarea>
        <button onclick={saveNote} disabled={!noteText.trim() || savingNote}>
          {savingNote ? 'Saving...' : 'Add note'}
        </button>
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="note-list">
        {#each notes as note (note.id)}
          <article class="note">
            <p>{note.body}</p>
            <time>{formatTimestamp(note.created_at)}</time>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  .detail-view {
    min-height: 100dvh;
    width: min(760px, 100%);
    margin: 0 auto;
    padding: max(14px, env(safe-area-inset-top)) 16px 44px;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    gap: 8px;
    padding: 4px 0 10px;
    background: color-mix(in srgb, var(--color-bg) 94%, transparent);
    backdrop-filter: blur(8px);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    min-width: 0;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 21px;
  }

  h2 {
    margin-bottom: 12px;
    font-size: 19px;
  }

  .icon-button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }

  .icon-button svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .status {
    margin-top: 48px;
    color: var(--color-muted);
    text-align: center;
  }

  .hero,
  .section {
    margin-bottom: 14px;
  }

  .hero {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    background: var(--color-surface-strong);
    color: var(--color-text-inverse);
  }

  .hero > p {
    color: var(--color-hero-muted);
    font-size: 13px;
  }

  .servings {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .servings > span {
    font-weight: 800;
  }

  .stepper {
    display: grid;
    grid-template-columns: 42px 84px 42px;
    gap: 6px;
  }

  .stepper button,
  .stepper input,
  .cook {
    min-height: 42px;
    border-radius: 8px;
    border: none;
  }

  .stepper button {
    background: var(--color-gold);
    color: var(--color-surface-strong);
    font-size: 20px;
    font-weight: 900;
  }

  .stepper input {
    width: 84px;
    padding: 0 8px;
    text-align: center;
  }

  .cook {
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 900;
    cursor: pointer;
  }

  .cook.active {
    background: var(--color-gold);
  }

  .wake-error,
  .error {
    color: var(--color-danger-soft);
    font-size: 13px;
  }

  .section {
    padding: 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .ingredients,
  .steps {
    padding-left: 22px;
    line-height: 1.5;
  }

  .ingredients li + li,
  .steps li + li {
    margin-top: 9px;
  }

  .steps strong {
    color: var(--color-accent-text);
  }

  .muted {
    color: var(--color-muted);
  }

  .note-form {
    display: grid;
    gap: 10px;
  }

  .note-form textarea {
    width: 100%;
    padding: 12px;
  }

  .note-form button {
    min-height: 42px;
    border: none;
    border-radius: 8px;
    background: var(--color-accent);
    color: var(--color-text-inverse);
    font-weight: 800;
    cursor: pointer;
  }

  .note-form button:disabled {
    opacity: 0.6;
  }

  .note-list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .note {
    padding: 12px;
    border-radius: 8px;
    background: var(--color-bg);
  }

  .note time {
    display: block;
    margin-top: 8px;
    color: var(--color-muted);
    font-size: 12px;
  }
</style>
