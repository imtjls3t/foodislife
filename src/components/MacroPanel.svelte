<script>
  import { formatNumber, formatTimestamp } from '../lib/recipeUtils.js';

  let { macroEstimate } = $props();

  const fields = [
    ['calories', 'Calories', 'kcal'],
    ['carbs_g', 'Carbs', 'g'],
    ['protein_g', 'Protein', 'g'],
    ['fiber_g', 'Fibre', 'g'],
    ['fat_g', 'Fat', 'g'],
    ['pufa_g', 'PUFA', 'g'],
    ['mufa_g', 'MUFA', 'g'],
    ['saturated_fat_g', 'Saturated', 'g'],
  ];

  function valueFor(group, key, suffix) {
    const value = group?.[key];
    if (value === null || value === undefined) return '-';
    return `${formatNumber(Number(value))} ${suffix}`;
  }
</script>

{#if macroEstimate}
  <section class="macros" aria-label="Nutrition estimate">
    <div class="macro-head">
      <div>
        <h2>Nutrition</h2>
        <p>
          {macroEstimate.stale ? 'Needs recalculation' : 'Approximate estimate'}
          {#if macroEstimate.calculated_at}
            · {formatTimestamp(macroEstimate.calculated_at)}
          {/if}
        </p>
      </div>
      {#if macroEstimate.stale}
        <span class="stale">Stale</span>
      {/if}
    </div>

    <div class="macro-grid">
      <div class="macro-column">
        <h3>Per serving</h3>
        {#each fields as [key, label, suffix]}
          <div class="macro-row">
            <span>{label}</span>
            <strong>{valueFor(macroEstimate.per_serving, key, suffix)}</strong>
          </div>
        {/each}
      </div>
      <div class="macro-column">
        <h3>Total</h3>
        {#each fields as [key, label, suffix]}
          <div class="macro-row">
            <span>{label}</span>
            <strong>{valueFor(macroEstimate.total, key, suffix)}</strong>
          </div>
        {/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .macros {
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
  }

  .macro-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 18px;
  }

  h3 {
    margin-bottom: 8px;
    font-size: 14px;
    color: var(--color-accent);
  }

  p {
    margin-top: 3px;
    color: var(--color-muted);
    font-size: 13px;
  }

  .stale {
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--color-warning);
    color: var(--color-warning-text);
    font-size: 12px;
    font-weight: 700;
  }

  .macro-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .macro-column {
    min-width: 0;
  }

  .macro-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
    border-top: 1px solid var(--color-divider);
    font-size: 13px;
  }

  .macro-row span {
    color: var(--color-muted-strong);
  }

  .macro-row strong {
    white-space: nowrap;
  }

  @media (max-width: 420px) {
    .macro-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
