<script lang="ts">
    // Component to enable selection of isotopes via checkboxes
    // Props:
    //   isotopes: string[] - list of isotope names to display
    //   selected: Set<string> (bindable) - currently selected isotopes
    import { onMount } from 'svelte';

    export let isotopes: string[] = [];
    // expose a bindable set so parent can read/write selection
    export let selected: Set<string> = new Set();

    function toggle(isotope: string) {
        if (selected.has(isotope)) {
            selected.delete(isotope);
        } else {
            selected.add(isotope);
        }
        // Force reactivity by creating a new Set reference
        selected = new Set(selected);
    }
</script>

<div class="isotope-enable">
    {#if isotopes.length === 0}
        <p>No isotopes available.</p>
    {:else}
        {#each isotopes as iso}
            <label class="checkbox label">
                <input type="checkbox"
                    checked={selected.has(iso)}
                    on:change={() => toggle(iso)} />
                {iso}
            </label>
        {/each}
    {/if}
</div>

<style>
    .isotope-enable {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .checkbox {
        display: flex;
        align-items: center;
    }
    .checkbox input {
        margin-right: 0.5rem;
    }
</style>
