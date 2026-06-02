<script>
  import { formatRelative } from '../lib/recipeUtils.js';

  let { recipe, onOpen } = $props();
</script>

<button class="recipe-card" onclick={() => onOpen(recipe)} aria-label={`Open ${recipe.title}`}>
  <div class="card-head">
    <div>
      <h2>{recipe.title}</h2>
      <p>{recipe.base_servings} {Number(recipe.base_servings) === 1 ? 'serve' : 'serves'} · {formatRelative(recipe.created_at)}</p>
    </div>
    {#if recipe.macro_estimate}
      <span class:stale={recipe.macro_estimate.stale}>Macros</span>
    {/if}
  </div>
</button>

<style>
  .recipe-card {
    width: 100%;
    display: block;
    padding: 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow-card);
  }

  .recipe-card:active {
    transform: translateY(1px);
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 18px;
    line-height: 1.25;
  }

  .card-head p {
    margin-top: 4px;
    color: var(--color-muted);
    font-size: 13px;
  }

  span {
    flex-shrink: 0;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--color-accent-soft);
    color: var(--color-accent-text);
    font-size: 12px;
    font-weight: 700;
  }

  span.stale {
    background: var(--color-warning);
    color: var(--color-warning-text);
  }
</style>
