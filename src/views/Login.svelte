<script>
  import { getAuthRedirectUrl } from '../lib/authRedirect.js';
  import { supabase } from '../lib/supabase.js';

  let email = $state('');
  let password = $state('');
  let isSignUp = $state(false);
  let isResetMode = $state(false);
  let loading = $state(false);
  let message = $state('');
  let messageKind = $state('');

  async function handleSubmit(event) {
    event.preventDefault();
    loading = true;
    message = '';
    messageKind = '';

    const redirectTo = getAuthRedirectUrl();
    try {
      const { error } = isResetMode
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        : isSignUp
          ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
          : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        message = error.message;
        messageKind = 'error';
      } else if (isResetMode) {
        message = 'Check your email for a password reset link.';
        messageKind = 'success';
      } else if (isSignUp) {
        message = 'Check your email for a confirmation link.';
        messageKind = 'success';
      }
    } catch (err) {
      message = err.message;
      messageKind = 'error';
    } finally {
      loading = false;
    }
  }

  function showResetMode() {
    isResetMode = true;
    isSignUp = false;
    password = '';
    message = '';
    messageKind = '';
  }

  function showSignIn() {
    isResetMode = false;
    isSignUp = false;
    message = '';
    messageKind = '';
  }

  function toggleSignUp() {
    isSignUp = !isSignUp;
    isResetMode = false;
    message = '';
    messageKind = '';
  }
</script>

<main class="login">
  <div class="brand">
    <div class="mark" aria-hidden="true">F</div>
    <h1>FoodIsLife</h1>
    <p>{isResetMode ? 'Reset your password' : isSignUp ? 'Create your recipe account' : 'Sign in to your recipes'}</p>
  </div>

  <form onsubmit={handleSubmit}>
    <label>
      <span>Email</span>
      <input type="email" autocomplete="username" bind:value={email} disabled={loading} required />
    </label>
    {#if !isResetMode}
      <label>
        <span>Password</span>
        <input
          type="password"
          autocomplete={isSignUp ? 'new-password' : 'current-password'}
          bind:value={password}
          disabled={loading}
          minlength="6"
          required
        />
      </label>
    {/if}

    {#if message}
      <p class:error={messageKind === 'error'} class:success={messageKind === 'success'} class="message">{message}</p>
    {/if}

    <button class="submit" type="submit" disabled={loading}>
      {loading ? 'Working...' : isResetMode ? 'Send reset link' : isSignUp ? 'Sign up' : 'Sign in'}
    </button>
  </form>

  {#if isResetMode}
    <button class="toggle" onclick={showSignIn}>Back to sign in</button>
  {:else}
    {#if !isSignUp}
      <button class="toggle" onclick={showResetMode}>Forgot password?</button>
    {/if}
    <button class="toggle secondary-toggle" onclick={toggleSignUp}>
      {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
    </button>
  {/if}
</main>

<style>
  .login {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 24px;
  }

  .brand {
    width: 100%;
    max-width: 360px;
    margin: 0 auto 30px;
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

  form {
    width: 100%;
    max-width: 360px;
    margin: 0 auto;
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
    font-size: 13px;
    text-align: center;
  }

  .message.error {
    color: var(--color-danger);
  }

  .message.success {
    color: var(--color-accent);
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

  .secondary-toggle {
    margin-top: 10px;
  }
</style>
