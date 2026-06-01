<script>
  import { listRecipes, supabase } from '../lib/supabase.js';
  import RecipeCard from '../components/RecipeCard.svelte';

  let { onAdd, onOpen } = $props();

  let query = $state('');
  let recipes = $state([]);
  let loading = $state(false);
  let error = $state('');
  let searchTimeout = null;

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

  async function logout() {
    await supabase.auth.signOut();
  }
</script>

<main class="list-view">
  <header>
    <div>
      <p class="eyebrow">FoodIsLife</p>
      <h1>Recipes</h1>
    </div>
    <button class="logout" onclick={logout}>Logout</button>
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
    color: #2f6f4e;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
  }

  h1 {
    font-size: 30px;
    line-height: 1.1;
  }

  .logout {
    border: 1px solid #d7d0bf;
    border-radius: 8px;
    background: #fffdf8;
    color: #4f493f;
    padding: 9px 12px;
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
    stroke: #786f60;
    stroke-width: 2;
    stroke-linecap: round;
  }

  input {
    width: 100%;
    padding: 14px 14px 14px 44px;
    font-size: 16px;
    box-shadow: 0 8px 24px rgba(248, 246, 240, 0.85);
  }

  .cards {
    display: grid;
    gap: 12px;
  }

  .status,
  .error {
    margin: 48px 0 0;
    color: #786f60;
    text-align: center;
  }

  .error {
    margin: 0 0 12px;
    color: #a8432f;
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
    background: #172017;
    color: #f8f6f0;
    box-shadow: 0 10px 26px rgba(23, 32, 23, 0.28);
    cursor: pointer;
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
