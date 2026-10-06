<script>
  import { onMount } from 'svelte';

  const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;
  const CHECK_INTERVAL_MS = 15 * 60 * 1000;

  let updateAvailable = $state(false);
  let updating = $state(false);
  let barHeight = $state(0);

  onMount(() => {
    if (import.meta.env.DEV) return;

    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkForUpdate();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.documentElement.style.removeProperty('--update-bar-height');
    };
  });

  // Sticky headers in the views offset themselves by this so the bar never covers them.
  $effect(() => {
    document.documentElement.style.setProperty('--update-bar-height', `${updateAvailable ? barHeight : 0}px`);
  });

  async function checkForUpdate() {
    if (updateAvailable) return;
    try {
      const response = await fetch(VERSION_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const { version } = await response.json();
      if (version && version !== __APP_VERSION__) updateAvailable = true;
    } catch {
      // Offline or mid-deploy; try again on the next check.
    }
  }

  async function update() {
    updating = true;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // The reload below still fetches the new build.
    }
    window.location.reload();
  }
</script>

{#if updateAvailable}
  <div class="update-bar" role="status" bind:offsetHeight={barHeight}>
    <span>A new version is available.</span>
    <button type="button" onclick={update} disabled={updating}>
      {updating ? 'Updating…' : 'Update'}
    </button>
  </div>
{/if}

<style>
  .update-bar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: calc(8px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));
    background: var(--color-surface-strong);
    color: var(--color-text-inverse);
    font-size: 0.9rem;
    font-weight: 600;
    box-shadow: var(--shadow-soft);
  }

  button {
    min-height: 32px;
    padding: 4px 14px;
    border: 0;
    border-radius: 999px;
    background: var(--color-gold);
    color: #172017;
    font-weight: 800;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.7;
    cursor: default;
  }
</style>
