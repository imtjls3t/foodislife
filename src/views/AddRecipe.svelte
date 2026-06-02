<script>
  import { buildManualRecipe, formatIngredientLine, normalizeRecipe } from '../lib/recipeUtils.js';
  import { createRecipe, fixRecipe } from '../lib/supabase.js';

  let { onCancel, onSaved } = $props();

  let sourceText = $state('');
  let draft = $state(null);
  let fixing = $state(false);
  let saving = $state(false);
  let error = $state('');

  async function handleFix() {
    if (!sourceText.trim()) return;
    fixing = true;
    error = '';
    try {
      draft = await fixRecipe(sourceText.trim());
    } catch (err) {
      error = err.message;
    }
    fixing = false;
  }

  function handleManual() {
    draft = buildManualRecipe(sourceText);
  }

  async function handleSave() {
    saving = true;
    error = '';
    try {
      const saved = await createRecipe(normalizeRecipe(draft));
      onSaved(saved);
    } catch (err) {
      error = err.message;
      saving = false;
    }
  }
</script>

<main class="add-view">
  <header>
    <button class="icon-button" onclick={onCancel} aria-label="Back to recipes">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m15 18-6-6 6-6"></path>
      </svg>
    </button>
    <h1>Add Recipe</h1>
    <span></span>
  </header>

  {#if !draft}
    <section class="paste">
      <label>
        <span>Recipe text</span>
        <textarea
          rows="16"
          placeholder="Paste a recipe here"
          bind:value={sourceText}
          disabled={fixing}
        ></textarea>
      </label>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="actions">
        <button class="primary" onclick={handleFix} disabled={!sourceText.trim() || fixing}>
          {fixing ? 'Fixing...' : 'Fix recipe'}
        </button>
        <button class="secondary" onclick={handleManual} disabled={fixing}>
          Create manually
        </button>
      </div>
    </section>
  {:else}
    <section class="review">
      <label>
        <span>Title</span>
        <input bind:value={draft.title} />
      </label>
      <label>
        <span>Serves</span>
        <input type="number" min="1" step="1" bind:value={draft.base_servings} />
      </label>

      <div class="preview">
        <h2>Ingredients</h2>
        {#if draft.ingredients.length}
          <ul>
            {#each draft.ingredients as ingredient}
              <li>{formatIngredientLine(ingredient, 1)}</li>
            {/each}
          </ul>
        {:else}
          <p>No ingredients yet</p>
        {/if}
      </div>

      <div class="preview">
        <h2>Procedure</h2>
        {#if draft.steps.length}
          <ol>
            {#each draft.steps as step}
              <li>{step.text}</li>
            {/each}
          </ol>
        {:else}
          <p>No steps yet</p>
        {/if}
      </div>

      {#if error}
        <p class="error">{error}</p>
      {/if}

      <div class="actions">
        <button class="primary" onclick={handleSave} disabled={saving || !draft.title.trim()}>
          {saving ? 'Saving...' : 'Save recipe'}
        </button>
        <button class="secondary" onclick={() => draft = null} disabled={saving}>Back</button>
      </div>
    </section>
  {/if}
</main>

<style>
  .add-view {
    min-height: 100dvh;
    width: min(760px, 100%);
    margin: 0 auto;
    padding: max(14px, env(safe-area-inset-top)) 16px 40px;
  }

  header {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    gap: 8px;
    margin-bottom: 18px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    text-align: center;
    font-size: 22px;
  }

  h2 {
    font-size: 16px;
    margin-bottom: 10px;
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
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .paste,
  .review {
    display: grid;
    gap: 16px;
  }

  label {
    display: grid;
    gap: 7px;
    color: var(--color-muted-strong);
    font-size: 13px;
    font-weight: 800;
  }

  textarea,
  input {
    width: 100%;
    padding: 13px 14px;
    font-size: 16px;
  }

  .preview {
    padding: 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: 8px;
    background: var(--color-surface);
  }

  ul,
  ol {
    padding-left: 20px;
    color: var(--color-text);
    line-height: 1.45;
  }

  li + li {
    margin-top: 6px;
  }

  .preview p,
  .error {
    color: var(--color-muted);
  }

  .error {
    color: var(--color-danger);
    text-align: center;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  button.primary,
  button.secondary {
    min-height: 46px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 800;
  }

  .primary {
    border: none;
    background: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .secondary {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }

  button:disabled {
    opacity: 0.6;
  }
</style>
