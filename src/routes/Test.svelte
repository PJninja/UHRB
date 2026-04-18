<script>
  let count = 0;
</script>

<div style="padding: 2rem; color: white;">
  <h1>Test Page</h1>
  <p>If you can see this, routing works!</p>
  <button on:click={() => count++}>
    Count: {count}
  </button>
</div>
