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
  let suppressHistory = false;

  onMount(() => {
    if (!history.state?.foodislife) {
      history.replaceState({ foodislife: true, view: 'list' }, '');
    }

    function handlePopState(event) {
      const state = event.state;
      suppressHistory = true;
      if (!state?.foodislife || state.view === 'list') {
        showList();
      } else if (state.view === 'detail' && state.recipeId) {
        selectedRecipeId = state.recipeId;
        editingRecipe = null;
        view = 'detail';
      } else {
        showList();
      }
      queueMicrotask(() => {
        suppressHistory = false;
      });
    }

    window.addEventListener('popstate', handlePopState);

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

    return () => {
      window.removeEventListener('popstate', handlePopState);
      subscription.unsubscribe();
    };
  });

  function openRecipe(recipe) {
    selectedRecipeId = recipe.id;
    editingRecipe = null;
    view = 'detail';
    pushAppHistory({ view: 'detail', recipeId: recipe.id });
  }

  function editRecipe(recipe) {
    editingRecipe = recipe;
    selectedRecipeId = recipe.id;
    view = 'edit';
    pushAppHistory({ view: 'edit', recipeId: recipe.id });
  }

  function showList() {
    view = 'list';
    selectedRecipeId = null;
    editingRecipe = null;
  }

  function navigateList() {
    showList();
    pushAppHistory({ view: 'list' });
  }

  function pushAppHistory(state) {
    if (suppressHistory) return;
    const nextState = { foodislife: true, ...state };
    if (state.view === 'list') {
      history.replaceState(nextState, '');
      return;
    }
    history.pushState(nextState, '');
  }
</script>

{#if loading}
  <div class="loading">
    <div class="spinner"></div>
  </div>
{:else if !session}
  <Login />
{:else if view === 'add'}
  <AddRecipe onCancel={navigateList} onSaved={openRecipe} />
{:else if view === 'detail' && selectedRecipeId}
  <RecipeDetail recipeId={selectedRecipeId} onBack={navigateList} onEdit={editRecipe} />
{:else if view === 'edit' && editingRecipe}
  <EditRecipe recipe={editingRecipe} onCancel={() => openRecipe(editingRecipe)} onSaved={openRecipe} />
{:else}
  <RecipeList onAdd={() => { view = 'add'; pushAppHistory({ view: 'add' }); }} onOpen={openRecipe} />
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
