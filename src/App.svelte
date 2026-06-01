<script>
  import { onMount } from 'svelte';
  import { supabase } from './lib/supabase.js';
  import Login from './views/Login.svelte';
  import RecipeList from './views/RecipeList.svelte';
  import AddRecipe from './views/AddRecipe.svelte';
  import RecipeDetail from './views/RecipeDetail.svelte';
  import EditRecipe from './views/EditRecipe.svelte';

  let session = $state(null);
  let loading = $state(true);
  let view = $state('list');
  let selectedRecipeId = $state(null);
  let editingRecipe = $state(null);

  onMount(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      session = currentSession;
      loading = false;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      session = currentSession;
      if (!currentSession) {
        view = 'list';
        selectedRecipeId = null;
        editingRecipe = null;
      }
    });

    return () => subscription.unsubscribe();
  });

  function openRecipe(recipe) {
    selectedRecipeId = recipe.id;
    editingRecipe = null;
    view = 'detail';
  }

  function editRecipe(recipe) {
    editingRecipe = recipe;
    selectedRecipeId = recipe.id;
    view = 'edit';
  }

  function showList() {
    view = 'list';
    selectedRecipeId = null;
    editingRecipe = null;
  }
</script>

{#if loading}
  <div class="loading">
    <div class="spinner"></div>
  </div>
{:else if !session}
  <Login />
{:else if view === 'add'}
  <AddRecipe onCancel={showList} onSaved={openRecipe} />
{:else if view === 'detail' && selectedRecipeId}
  <RecipeDetail recipeId={selectedRecipeId} onBack={showList} onEdit={editRecipe} />
{:else if view === 'edit' && editingRecipe}
  <EditRecipe recipe={editingRecipe} onCancel={() => openRecipe(editingRecipe)} onSaved={openRecipe} />
{:else}
  <RecipeList onAdd={() => view = 'add'} onOpen={openRecipe} />
{/if}

<style>
  .loading {
    min-height: 100dvh;
    display: grid;
    place-items: center;
  }

  .spinner {
    width: 34px;
    height: 34px;
    border: 3px solid #d7d0bf;
    border-top-color: #2f6f4e;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
