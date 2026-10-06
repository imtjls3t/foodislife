<script>
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import MacroPanel from '../components/MacroPanel.svelte';
  import { calculateMacros, updateRecipe } from '../lib/supabase.js';
  import {
    formatIngredientLine,
    makeId,
    normalizeIngredient,
    rebuildStepReferences,
    toNullableNumber,
  } from '../lib/recipeUtils.js';

  let { recipe, onCancel, onSaved } = $props();

  const unitOptions = ['', 'g', 'ml', 'tsp', 'tbsp', 'cup', 'item', 'pinch', 'to taste'];

  let loadedRecipeId = $state(null);
  let title = $state('');
  let baseServings = $state(1);
  let sourceText = $state('');
  let ingredients = $state([]);
  let steps = $state([]);
  let macroEstimate = $state(null);
  let saving = $state(false);
  let calculating = $state(false);
  let error = $state('');
  let ingredientsElement;
  let stepsElement;
  let dragKind = $state(null);
  let draggedItemId = $state(null);
  let dragPointerY = $state(0);
  let dragPreviewLeft = $state(0);
  let dragPreviewWidth = $state(0);
  let dragPreviewHeight = $state(0);
  let reorderAnnouncement = $state('');
  let dragOffsetY = $state(0);
  let dragPointerId = null;
  let dragStartIndex = -1;

  let draggedIngredient = $derived(dragKind === 'ingredient' && ingredients.find((ingredient) => ingredient.id === draggedItemId));
  let draggedStep = $derived(dragKind === 'step' && steps.find((step) => step.id === draggedItemId));

  $effect(() => {
    if (loadedRecipeId === recipe.id) return;
    loadedRecipeId = recipe.id;
    title = recipe.title || '';
    baseServings = recipe.base_servings || 1;
    sourceText = recipe.source_text || '';
    ingredients = (recipe.ingredients || []).map((ingredient, index) => normalizeIngredient(ingredient, index));
    steps = (recipe.steps || []).map((step, index) => ({
      id: step.id || `step_${index + 1}`,
      text: step.text || '',
    }));
    macroEstimate = recipe.macro_estimate || null;
  });

  function markMacrosStale() {
    if (macroEstimate && !macroEstimate.stale) {
      macroEstimate = { ...macroEstimate, stale: true };
    }
  }

  function updateIngredient(index, patch) {
    ingredients = ingredients.map((ingredient, currentIndex) => {
      if (currentIndex !== index) return ingredient;
      return normalizeIngredient({ ...ingredient, ...patch }, currentIndex);
    });
    markMacrosStale();
  }

  function addIngredient() {
    ingredients = [
      ...ingredients,
      {
        id: makeId('ing'),
        name: '',
        amount: null,
        unit: '',
        grams: null,
        note: '',
        original_text: '',
        estimated_density: false,
      },
    ];
    markMacrosStale();
  }

  function removeIngredient(index) {
    ingredients = ingredients.filter((_, currentIndex) => currentIndex !== index);
    markMacrosStale();
  }

  function updateStep(index, text) {
    steps = steps.map((step, currentIndex) => currentIndex === index ? { ...step, text } : step);
  }

  function addStep() {
    steps = [...steps, { id: makeId('step'), text: '' }];
  }

  function removeStep(index) {
    steps = steps.filter((_, currentIndex) => currentIndex !== index);
  }

  function getReorderItems(kind) {
    return kind === 'ingredient' ? ingredients : steps;
  }

  function moveItem(kind, fromIndex, toIndex) {
    const items = getReorderItems(kind);
    if (
      fromIndex === toIndex
      || fromIndex < 0
      || fromIndex >= items.length
      || toIndex < 0
      || toIndex >= items.length
    ) return;

    const reordered = [...items];
    const [movedItem] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, movedItem);
    if (kind === 'ingredient') ingredients = reordered;
    else steps = reordered;
  }

  function startDrag(event, kind, itemId) {
    if (draggedItemId !== null || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const row = event.currentTarget.closest(`[data-reorder-id]`);
    if (!row) return;

    event.preventDefault();
    // Keep capture on the list, since keyed rows can move during a drag.
    const list = kind === 'ingredient' ? ingredientsElement : stepsElement;
    list.setPointerCapture(event.pointerId);

    const bounds = row.getBoundingClientRect();
    dragKind = kind;
    draggedItemId = itemId;
    dragPointerId = event.pointerId;
    dragPointerY = event.clientY;
    dragOffsetY = event.clientY - bounds.top;
    dragPreviewLeft = bounds.left;
    dragPreviewWidth = bounds.width;
    dragPreviewHeight = bounds.height;
    dragStartIndex = getReorderItems(kind).findIndex((item) => item.id === itemId);
  }

  function updateDrag(event) {
    if (draggedItemId === null || event.pointerId !== dragPointerId) return;

    event.preventDefault();
    dragPointerY = event.clientY;
    scrollWhileDragging(event.clientY);

    const list = dragKind === 'ingredient' ? ingredientsElement : stepsElement;
    const rows = Array.from(list?.querySelectorAll('[data-reorder-id]') || []);
    const remainingRows = rows.filter((row) => row.dataset.reorderId !== draggedItemId);
    let targetIndex = remainingRows.length;

    for (const [index, row] of remainingRows.entries()) {
      const bounds = row.getBoundingClientRect();
      if (event.clientY < bounds.top + bounds.height / 2) {
        targetIndex = index;
        break;
      }
    }

    const currentIndex = getReorderItems(dragKind).findIndex((item) => item.id === draggedItemId);
    moveItem(dragKind, currentIndex, targetIndex);
  }

  function finishDrag(event) {
    if (draggedItemId === null || event.pointerId !== dragPointerId) return;

    const finalIndex = getReorderItems(dragKind).findIndex((item) => item.id === draggedItemId);
    if (finalIndex !== dragStartIndex) {
      const label = dragKind === 'ingredient' ? 'Ingredient' : 'Step';
      reorderAnnouncement = `${label} moved to position ${finalIndex + 1}.`;
    }

    draggedItemId = null;
    dragKind = null;
    dragPointerId = null;
    dragStartIndex = -1;
  }

  async function handleDragKeydown(event, kind, index) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    if (draggedItemId !== null) return;
    const targetIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= getReorderItems(kind).length) return;

    const handle = event.currentTarget;
    moveItem(kind, index, targetIndex);
    const label = kind === 'ingredient' ? 'Ingredient' : 'Step';
    reorderAnnouncement = `${label} moved to position ${targetIndex + 1}.`;
    await tick();
    handle.focus({ preventScroll: true });
  }

  function scrollWhileDragging(pointerY) {
    const edgeSize = 72;
    if (pointerY < edgeSize) {
      window.scrollBy({ top: -12, behavior: 'auto' });
    } else if (pointerY > window.innerHeight - edgeSize) {
      window.scrollBy({ top: 12, behavior: 'auto' });
    }
  }

  function setServings(value) {
    baseServings = Math.max(1, Number(value) || 1);
    markMacrosStale();
  }

  function buildDraft() {
    const cleanIngredients = ingredients
      .map((ingredient, index) => normalizeIngredient({
        ...ingredient,
        amount: toNullableNumber(ingredient.amount),
        grams: toNullableNumber(ingredient.grams),
        id: ingredient.id || `ing_${index + 1}`,
      }, index))
      .filter((ingredient) => ingredient.name.trim());

    const cleanSteps = steps
      .map((step, index) => rebuildStepReferences(step.text.trim(), cleanIngredients, index))
      .filter((step) => step.text.trim());

    return {
      ...recipe,
      title: title.trim() || 'Untitled recipe',
      base_servings: Math.max(1, Number(baseServings) || 1),
      ingredients: cleanIngredients,
      steps: cleanSteps,
      source_text: sourceText,
      macro_estimate: macroEstimate,
    };
  }

  async function handleCalculateMacros() {
    calculating = true;
    error = '';
    try {
      macroEstimate = await calculateMacros(buildDraft());
    } catch (err) {
      error = err.message;
    }
    calculating = false;
  }

  async function handleSave() {
    saving = true;
    error = '';
    try {
      const saved = await updateRecipe(recipe.id, buildDraft());
      onSaved(saved);
    } catch (err) {
      error = err.message;
      saving = false;
    }
  }
</script>

<svelte:window
  onpointermove={updateDrag}
  onpointerup={finishDrag}
  onpointercancel={finishDrag}
  onlostpointercapture={finishDrag}
/>

<main class="edit-view">
  <header>
    <button class="icon-button" onclick={onCancel} aria-label="Cancel edit">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m15 18-6-6 6-6"></path>
      </svg>
    </button>
    <h1>Edit Recipe</h1>
    <button class="save-top" onclick={handleSave} disabled={saving || !title.trim()}>
      {saving ? 'Saving...' : 'Save'}
    </button>
  </header>

  <section class="panel">
    <label>
      <span>Title</span>
      <input bind:value={title} />
    </label>
    <label>
      <span>Serves</span>
      <input
        type="number"
        min="1"
        step="1"
        value={baseServings}
        oninput={(event) => setServings(event.currentTarget.value)}
      />
    </label>
  </section>

  <section class="panel">
    <div class="section-head">
      <h2>Ingredients</h2>
      <button class="small" onclick={addIngredient}>Add</button>
    </div>

    <div class="ingredients" bind:this={ingredientsElement}>
      {#each ingredients as ingredient, index (ingredient.id)}
        <div
          class="ingredient-row"
          class:is-dragging={dragKind === 'ingredient' && draggedItemId === ingredient.id}
          data-reorder-id={ingredient.id}
          animate:flip={{ duration: 140 }}
        >
          <input
            class="amount"
            type="number"
            step="any"
            placeholder="Amt"
            aria-label="Amount"
            value={ingredient.amount ?? ''}
            oninput={(event) => updateIngredient(index, { amount: event.currentTarget.value })}
          />
          <select
            aria-label="Unit"
            value={ingredient.unit}
            onchange={(event) => updateIngredient(index, { unit: event.currentTarget.value })}
          >
            {#each unitOptions as unit}
              <option value={unit}>{unit || 'unit'}</option>
            {/each}
          </select>
          <input
            class="grams"
            type="number"
            step="any"
            placeholder="g equiv"
            aria-label="Gram equivalent"
            value={ingredient.grams ?? ''}
            oninput={(event) => updateIngredient(index, { grams: event.currentTarget.value })}
          />
          <input
            class="name"
            placeholder="Ingredient"
            aria-label="Ingredient name"
            value={ingredient.name}
            oninput={(event) => updateIngredient(index, { name: event.currentTarget.value })}
          />
          <input
            class="note"
            placeholder="Note"
            aria-label="Ingredient note"
            value={ingredient.note}
            oninput={(event) => updateIngredient(index, { note: event.currentTarget.value })}
          />
          <div class="ingredient-actions">
            <button
              class="drag-handle ingredient-handle"
              aria-label={`Drag to reorder ingredient ${index + 1}. Use arrow keys to move it when focused.`}
              aria-keyshortcuts="ArrowUp ArrowDown"
              title="Drag to reorder"
              onpointerdown={(event) => startDrag(event, 'ingredient', ingredient.id)}
              onkeydown={(event) => handleDragKeydown(event, 'ingredient', index)}
            >
              {@render ingredientGrip()}
            </button>
            <button class="remove" onclick={() => removeIngredient(index)} aria-label="Remove ingredient">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12"></path>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <section class="panel">
    <div class="section-head">
      <div>
        <h2>Procedure</h2>
        <p>Drag the handles to reorder steps</p>
      </div>
      <button class="small" onclick={addStep}>Add</button>
    </div>

    <div class="steps" bind:this={stepsElement}>
      {#each steps as step, index (step.id)}
        <div
          class:is-dragging={dragKind === 'step' && draggedItemId === step.id}
          class="step-row"
          data-reorder-id={step.id}
          animate:flip={{ duration: 140 }}
        >
          <button
            class="drag-handle"
            aria-label={`Drag to reorder step ${index + 1}. Use arrow keys to move it when focused.`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            title="Drag to reorder"
            onpointerdown={(event) => startDrag(event, 'step', step.id)}
            onkeydown={(event) => handleDragKeydown(event, 'step', index)}
          >
            <span>{index + 1}</span>
            <svg aria-hidden="true" viewBox="0 0 24 16">
              <circle cx="8" cy="4" r="1.5"></circle>
              <circle cx="16" cy="4" r="1.5"></circle>
              <circle cx="8" cy="12" r="1.5"></circle>
              <circle cx="16" cy="12" r="1.5"></circle>
            </svg>
          </button>
          <textarea
            rows="3"
            placeholder="Step"
            aria-label={`Step ${index + 1}`}
            value={step.text}
            oninput={(event) => updateStep(index, event.currentTarget.value)}
          ></textarea>
          <button class="remove" onclick={() => removeStep(index)} aria-label="Remove step">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  </section>

  <p class="sr-only" aria-live="polite">{reorderAnnouncement}</p>

  {#if draggedIngredient}
    <div
      class="ingredient-drag-preview"
      style={`top: ${dragPointerY - dragOffsetY}px; left: ${dragPreviewLeft}px; width: ${dragPreviewWidth}px; min-height: ${dragPreviewHeight}px;`}
      aria-hidden="true"
    >
      <div class="ingredient-drag-text">{formatIngredientLine(draggedIngredient)}</div>
      <div class="drag-handle ingredient-handle">{@render ingredientGrip()}</div>
      <span></span>
    </div>
  {/if}

  {#if draggedStep}
    <div
      class="step-drag-preview"
      style={`top: ${dragPointerY - dragOffsetY}px; left: ${dragPreviewLeft}px; width: ${dragPreviewWidth}px; min-height: ${dragPreviewHeight}px;`}
      aria-hidden="true"
    >
      <div class="drag-handle preview-handle">
        <span>{steps.findIndex((step) => step.id === draggedItemId) + 1}</span>
        <svg viewBox="0 0 24 16">
          <circle cx="8" cy="4" r="1.5"></circle>
          <circle cx="16" cy="4" r="1.5"></circle>
          <circle cx="8" cy="12" r="1.5"></circle>
          <circle cx="16" cy="12" r="1.5"></circle>
        </svg>
      </div>
      <div class="step-drag-text">{draggedStep.text || 'Empty step'}</div>
      <span></span>
    </div>
  {/if}

  <section class="panel">
    <div class="section-head">
      <div>
        <h2>Nutrition</h2>
        <p>Approximate OpenAI estimate</p>
      </div>
      <button class="small primary-small" onclick={handleCalculateMacros} disabled={calculating || !ingredients.length}>
        {calculating ? 'Calculating...' : 'Calculate Macros'}
      </button>
    </div>
    <MacroPanel {macroEstimate} />
  </section>

  <section class="panel">
    <label>
      <span>Source text</span>
      <textarea rows="8" bind:value={sourceText}></textarea>
    </label>
  </section>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="bottom-actions">
    <button class="primary" onclick={handleSave} disabled={saving || !title.trim()}>
      {saving ? 'Saving...' : 'Save recipe'}
    </button>
    <button class="secondary" onclick={onCancel} disabled={saving}>Cancel</button>
  </div>
</main>

{#snippet ingredientGrip()}
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="8" cy="5" r="1.5"></circle>
    <circle cx="16" cy="5" r="1.5"></circle>
    <circle cx="8" cy="12" r="1.5"></circle>
    <circle cx="16" cy="12" r="1.5"></circle>
    <circle cx="8" cy="19" r="1.5"></circle>
    <circle cx="16" cy="19" r="1.5"></circle>
  </svg>
{/snippet}

<style>
  .edit-view {
    min-height: 100dvh;
    width: min(820px, 100%);
    margin: 0 auto;
    padding: max(14px, env(safe-area-inset-top)) 16px 44px;
  }

  header {
    position: sticky;
    top: var(--update-bar-height, 0px);
    z-index: 3;
    display: grid;
    grid-template-columns: 44px 1fr auto;
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
    text-align: center;
    font-size: 21px;
  }

  h2 {
    font-size: 18px;
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

  .icon-button svg,
  .remove svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .save-top,
  .small,
  .primary,
  .secondary {
    min-height: 40px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 800;
  }

  .save-top,
  .primary,
  .primary-small {
    border: none;
    background: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .save-top {
    padding: 0 14px;
  }

  .small {
    padding: 0 12px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .primary-small {
    border: none;
  }

  .panel {
    display: grid;
    gap: 14px;
    margin-bottom: 14px;
    padding: 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-head p {
    margin-top: 3px;
    color: var(--color-muted);
    font-size: 13px;
  }

  label {
    display: grid;
    gap: 7px;
    color: var(--color-muted-strong);
    font-size: 13px;
    font-weight: 800;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    padding: 11px 12px;
    font-size: 15px;
  }

  .ingredients,
  .steps {
    display: grid;
    gap: 10px;
  }

  .ingredient-row {
    display: grid;
    grid-template-columns: minmax(66px, 0.7fr) minmax(78px, 0.8fr) minmax(84px, 0.8fr) minmax(150px, 1.6fr) minmax(120px, 1.1fr) 88px;
    gap: 8px;
    align-items: center;
  }

  .step-row {
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    gap: 8px;
    align-items: start;
  }

  .ingredient-actions {
    display: flex;
    gap: 8px;
    justify-self: end;
  }

  .drag-handle {
    width: 40px;
    min-height: 76px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 4px;
    padding: 5px 0;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-alt);
    color: var(--color-muted-strong);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-handle > span {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-accent-soft);
    color: var(--color-accent-text);
    font-size: 13px;
    font-weight: 900;
  }

  .drag-handle svg {
    width: 24px;
    height: 16px;
    fill: currentColor;
  }

  .ingredient-handle {
    min-height: 40px;
    height: 40px;
  }

  .ingredient-handle svg {
    height: 24px;
  }

  .ingredient-row.is-dragging,
  .step-row.is-dragging {
    opacity: 0.24;
  }

  .step-drag-preview,
  .ingredient-drag-preview {
    position: fixed;
    z-index: 20;
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    gap: 8px;
    align-items: start;
    padding: 4px;
    border: 1px solid var(--color-accent);
    border-radius: 10px;
    background: var(--color-surface);
    box-shadow: var(--shadow-floating);
    pointer-events: none;
  }

  .ingredient-drag-preview {
    grid-template-columns: minmax(0, 1fr) 40px 40px;
    align-items: center;
  }

  .ingredient-drag-text {
    padding: 8px;
    overflow-wrap: anywhere;
    font-size: 15px;
  }

  .preview-handle {
    min-height: 68px;
    border-color: var(--color-accent);
    cursor: grabbing;
  }

  .step-drag-text {
    min-height: 68px;
    max-height: 112px;
    overflow: hidden;
    padding: 11px 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 15px;
    line-height: 1.35;
    white-space: pre-wrap;
  }

  .remove {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 8px;
    background: var(--color-danger-soft);
    color: var(--color-danger);
    cursor: pointer;
  }

  .bottom-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .primary,
  .secondary {
    min-height: 46px;
  }

  .secondary {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }

  button:disabled {
    opacity: 0.6;
  }

  .error {
    margin: 0 0 12px;
    color: var(--color-danger);
    text-align: center;
  }

  @media (max-width: 800px) {
    .ingredient-row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(88px, 1fr);
    }

    .ingredient-row .name {
      grid-column: 1 / -1;
    }

    .ingredient-row .note {
      grid-column: 1 / 3;
    }
  }
</style>
