<script>
  import { onDestroy, onMount } from 'svelte';
  import MacroPanel from '../components/MacroPanel.svelte';
  import { addNote, getRecipe, listNotes } from '../lib/supabase.js';
  import {
    buildStepSegments,
    extractTimers,
    formatIngredientLine,
    formatTimestamp,
    formatTimerLabel,
  } from '../lib/recipeUtils.js';

  let { recipeId, onBack, onEdit } = $props();

  let recipe = $state(null);
  let notes = $state([]);
  let currentServings = $state(1);
  let loading = $state(true);
  let error = $state('');
  let noteText = $state('');
  let savingNote = $state(false);
  let activeTimers = $state({});
  let cookMode = $state(false);
  let wakeError = $state('');
  let wakeLock = null;

  let scale = $derived(recipe ? Number(currentServings || 1) / Number(recipe.base_servings || 1) : 1);

  onMount(load);

  onDestroy(() => {
    releaseWakeLock();
  });

  $effect(() => {
    const hasTimers = Object.values(activeTimers).some((timer) => timer.remaining > 0);
    if (!hasTimers) return;

    const interval = setInterval(() => {
      const next = {};
      const completed = [];

      for (const [id, timer] of Object.entries(activeTimers)) {
        const remaining = Math.max(timer.remaining - 1, 0);
        if (remaining === 0) {
          completed.push(timer);
        } else {
          next[id] = { ...timer, remaining };
        }
      }

      activeTimers = next;
      completed.forEach(notifyTimerComplete);
    }, 1000);

    return () => clearInterval(interval);
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

  function getStepTimers(step) {
    return step.timers?.length ? step.timers : extractTimers(step.text);
  }

  function startTimer(step, timer) {
    const id = `${step.id}_${timer.id || timer.label}_${Date.now()}`;
    activeTimers = {
      ...activeTimers,
      [id]: {
        label: timer.label || formatTimerLabel(timer.seconds),
        remaining: timer.seconds,
        total: timer.seconds,
      },
    };
  }

  function cancelTimer(id) {
    const next = { ...activeTimers };
    delete next[id];
    activeTimers = next;
  }

  function formatClock(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function notifyTimerComplete(timer) {
    if ('vibrate' in navigator) navigator.vibrate([160, 80, 160]);
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.45);
    } catch {
      // Timer completion still updates visually if audio is unavailable.
    }
    activeTimers = {
      ...activeTimers,
      [`done_${Date.now()}`]: {
        label: `${timer.label} done`,
        remaining: 0,
        total: 0,
        done: true,
      },
    };
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

    {#if Object.keys(activeTimers).length}
      <section class="active-timers" aria-label="Active timers">
        {#each Object.entries(activeTimers) as [id, timer] (id)}
          <div class:done={timer.done} class="timer-chip">
            <span>{timer.label}</span>
            <strong>{timer.done ? 'Done' : formatClock(timer.remaining)}</strong>
            <button onclick={() => cancelTimer(id)} aria-label="Dismiss timer">×</button>
          </div>
        {/each}
      </section>
    {/if}

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
              {#if getStepTimers(step).length}
                <div class="timer-buttons">
                  {#each getStepTimers(step) as timer}
                    <button onclick={() => startTimer(step, timer)}>
                      Start {timer.label || formatTimerLabel(timer.seconds)}
                    </button>
                  {/each}
                </div>
              {/if}
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
    background: rgba(248, 246, 240, 0.94);
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
    border: 1px solid #d7d0bf;
    border-radius: 8px;
    background: #fffdf8;
    color: #172017;
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
    color: #786f60;
    text-align: center;
  }

  .hero,
  .section,
  .active-timers {
    margin-bottom: 14px;
  }

  .hero {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-radius: 8px;
    background: #172017;
    color: #fffdf8;
  }

  .hero > p {
    color: #d6d0c1;
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
    background: #f2b84b;
    color: #172017;
    font-size: 20px;
    font-weight: 900;
  }

  .stepper input {
    width: 84px;
    padding: 0 8px;
    text-align: center;
  }

  .cook {
    background: #fffdf8;
    color: #172017;
    font-weight: 900;
    cursor: pointer;
  }

  .cook.active {
    background: #f2b84b;
  }

  .wake-error,
  .error {
    color: #ffd1c6;
    font-size: 13px;
  }

  .section {
    padding: 16px;
    border: 1px solid #e1d8c9;
    border-radius: 8px;
    background: #fffdf8;
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
    color: #214d35;
  }

  .muted {
    color: #786f60;
  }

  .timer-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 9px;
  }

  .timer-buttons button {
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: #dfeadf;
    color: #214d35;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .active-timers {
    display: grid;
    gap: 8px;
  }

  .timer-chip {
    display: grid;
    grid-template-columns: 1fr auto 32px;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #2f6f4e;
    color: #fffdf8;
  }

  .timer-chip.done {
    background: #a8432f;
  }

  .timer-chip button {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.16);
    color: currentColor;
    cursor: pointer;
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
    background: #2f6f4e;
    color: #fffdf8;
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
    background: #f8f6f0;
  }

  .note time {
    display: block;
    margin-top: 8px;
    color: #786f60;
    font-size: 12px;
  }
</style>
