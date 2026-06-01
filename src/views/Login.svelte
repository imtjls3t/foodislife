<script>
  import { supabase } from '../lib/supabase.js';

  let email = $state('');
  let password = $state('');
  let isSignUp = $state(false);
  let loading = $state(false);
  let message = $state('');

  async function handleSubmit(event) {
    event.preventDefault();
    loading = true;
    message = '';

    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      message = error.message;
    } else if (isSignUp) {
      message = 'Check your email for a confirmation link.';
    }

    loading = false;
  }
</script>

<main class="login">
  <div class="brand">
    <div class="mark" aria-hidden="true">F</div>
    <h1>FoodIsLife</h1>
    <p>{isSignUp ? 'Create your recipe account' : 'Sign in to your recipes'}</p>
  </div>

  <form onsubmit={handleSubmit}>
    <label>
      <span>Email</span>
      <input type="email" autocomplete="username" bind:value={email} disabled={loading} required />
    </label>
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

    {#if message}
      <p class="message">{message}</p>
    {/if}

    <button class="submit" type="submit" disabled={loading}>
      {loading ? 'Working...' : isSignUp ? 'Sign up' : 'Sign in'}
    </button>
  </form>

  <button class="toggle" onclick={() => { isSignUp = !isSignUp; message = ''; }}>
    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
  </button>
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
    background: #172017;
    color: #f2b84b;
    font-size: 26px;
    font-weight: 800;
  }

  h1 {
    margin: 0;
    font-size: 28px;
  }

  p {
    margin: 8px 0 0;
    color: #786f60;
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
    color: #4f493f;
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
    color: #a8432f;
    font-size: 13px;
    text-align: center;
  }

  .submit {
    padding: 14px;
    border: none;
    border-radius: 8px;
    background: #2f6f4e;
    color: #fffdf8;
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
    color: #2f6f4e;
    cursor: pointer;
  }
</style>
