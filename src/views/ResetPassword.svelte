<script>
  import { supabase } from '../lib/supabase.js';

  let { onSaved, onCancel } = $props();

  let password = $state('');
  let confirmPassword = $state('');
  let saving = $state(false);
  let error = $state('');
  let saved = $state(false);

  async function handleSubmit(event) {
    event.preventDefault();
    error = '';

    if (password.length < 6) {
      error = 'Password must be at least 6 characters.';
      return;
    }

    if (password !== confirmPassword) {
      error = 'Passwords do not match.';
      return;
    }

    saving = true;
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        error = updateError.message;
        return;
      }

      password = '';
      confirmPassword = '';
      saved = true;
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<main class="reset-password">
  <div class="brand">
    <div class="mark" aria-hidden="true">F</div>
    <h1>Reset Password</h1>
    <p>Choose a new password for FoodIsLife</p>
  </div>

  {#if saved}
    <div class="status">
      <p>Password updated.</p>
      <button class="submit" type="button" onclick={onSaved}>Continue</button>
    </div>
  {:else}
    <form onsubmit={handleSubmit}>
      <label>
        <span>New password</span>
        <input
          type="password"
          autocomplete="new-password"
          bind:value={password}
          disabled={saving}
          minlength="6"
          required
        />
      </label>
      <label>
        <span>Confirm password</span>
        <input
          type="password"
          autocomplete="new-password"
          bind:value={confirmPassword}
          disabled={saving}
          minlength="6"
          required
        />
      </label>

      {#if error}
        <p class="message">{error}</p>
      {/if}

      <button class="submit" type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save password'}
      </button>
    </form>

    <button class="toggle" type="button" onclick={onCancel}>Cancel</button>
  {/if}
</main>

<style>
  .reset-password {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 24px;
  }

  .brand,
  form,
  .status {
    width: 100%;
    max-width: 360px;
    margin-left: auto;
    margin-right: auto;
  }

  .brand {
    margin-bottom: 30px;
  }

  .mark {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    margin-bottom: 14px;
    border-radius: 8px;
    background: var(--color-surface-strong);
    color: var(--color-gold);
    font-size: 26px;
    font-weight: 800;
  }

  h1 {
    margin: 0;
    font-size: 28px;
  }

  p {
    margin: 8px 0 0;
    color: var(--color-muted);
  }

  form,
  .status {
    display: grid;
    gap: 14px;
  }

  label {
    display: grid;
    gap: 6px;
    color: var(--color-muted-strong);
    font-size: 13px;
    font-weight: 700;
  }

  input {
    width: 100%;
    padding: 14px 16px;
    font-size: 16px;
  }

  .message {
    margin: 0;
    color: var(--color-danger);
    font-size: 13px;
    text-align: center;
  }

  .status p {
    margin: 0;
    color: var(--color-accent);
    text-align: center;
  }

  .submit {
    padding: 14px;
    border: none;
    border-radius: 8px;
    background: var(--color-accent);
    color: var(--color-text-inverse);
    font-weight: 800;
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.65;
  }

  .toggle {
    margin: 18px auto 0;
    border: none;
    background: none;
    color: var(--color-accent);
    cursor: pointer;
  }
</style>
