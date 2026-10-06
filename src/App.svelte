<script>
  import { onMount } from 'svelte';
  import { supabase } from './lib/supabase.js';
  import UpdateBar from './components/UpdateBar.svelte';
  import Login from './views/Login.svelte';
  import ResetPassword from './views/ResetPassword.svelte';
  import RecipeList from './views/RecipeList.svelte';
  import AddRecipe from './views/AddRecipe.svelte';
  import RecipeDetail from './views/RecipeDetail.svelte';
  import EditRecipe from './views/EditRecipe.svelte';

  let session = $state(null);
  let loading = $state(true);
  let view = $state('list');
  let selectedRecipeId = $state(null);
  let editingRecipe = $state(null);
  let searchQuery = $state('');
  let darkMode = $state(false);
  let themeLoaded = false;
  let suppressHistory = false;

  onMount(() => {
    const startedFromRecoveryLink = isPasswordRecoveryRedirect();
    darkMode = localStorage.getItem('foodislife-dark-mode') === 'true';
    applyTheme();
    themeLoaded = true;

    if (!history.state?.foodislife) {
      history.replaceState({ foodislife: true, view: startedFromRecoveryLink ? 'reset-password' : 'list' }, '');
    }

    if (startedFromRecoveryLink) {
      view = 'reset-password';
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
      } else if (state.view === 'reset-password') {
        selectedRecipeId = null;
        editingRecipe = null;
        view = 'reset-password';
      } else {
        showList();
      }
      queueMicrotask(() => {
        suppressHistory = false;
      });
    }

    window.addEventListener('popstate', handlePopState);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      session = currentSession;
      if (event === 'PASSWORD_RECOVERY') {
        selectedRecipeId = null;
        editingRecipe = null;
        view = 'reset-password';
        history.replaceState({ foodislife: true, view: 'reset-password' }, '');
      }
      if (!currentSession) {
        searchQuery = '';
        view = 'list';
        selectedRecipeId = null;
        editingRecipe = null;
      }
    });

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      session = currentSession;
      if (startedFromRecoveryLink && currentSession) {
        view = 'reset-password';
      }
      loading = false;
    });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      subscription.unsubscribe();
    };
  });

  $effect(() => {
    if (!themeLoaded) return;
    applyTheme();
    localStorage.setItem('foodislife-dark-mode', darkMode ? 'true' : 'false');
  });

  function applyTheme() {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }

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

  function setDarkMode(value) {
    darkMode = Boolean(value);
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

  function finishPasswordRecovery() {
    showList();
    history.replaceState({ foodislife: true, view: 'list' }, '');
  }

  async function cancelPasswordRecovery() {
    showList();
    history.replaceState({ foodislife: true, view: 'list' }, '');
    await supabase.auth.signOut();
  }

  function isPasswordRecoveryRedirect() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('type') === 'recovery') return true;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return hashParams.get('type') === 'recovery';
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

<UpdateBar />

{#if loading}
  <div class="loading">
    <div class="spinner"></div>
  </div>
{:else if !session}
  <Login />
{:else if view === 'reset-password'}
  <ResetPassword onSaved={finishPasswordRecovery} onCancel={cancelPasswordRecovery} />
{:else if view === 'add'}
  <AddRecipe onCancel={navigateList} onSaved={openRecipe} />
{:else if view === 'detail' && selectedRecipeId}
  <RecipeDetail recipeId={selectedRecipeId} onBack={navigateList} onEdit={editRecipe} />
{:else if view === 'edit' && editingRecipe}
  <EditRecipe recipe={editingRecipe} onCancel={() => openRecipe(editingRecipe)} onSaved={openRecipe} />
{:else}
  <RecipeList
    bind:query={searchQuery}
    {darkMode}
    onDarkModeChange={setDarkMode}
    onAdd={() => { view = 'add'; pushAppHistory({ view: 'add' }); }}
    onOpen={openRecipe}
  />
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
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
