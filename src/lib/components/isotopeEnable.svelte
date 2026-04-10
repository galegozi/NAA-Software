<script lang="ts">
    type IsotopeOption = {
        value: string;
        label: string;
    };

    // Component to enable selection of isotopes via checkboxes
    // Props:
    //   isotopeOptions: { value, label }[] where value is internal key and label is user-facing name
    //   selected: Set<string> (bindable) - currently selected isotope keys
    let {
        isotopeOptions = $bindable<IsotopeOption[]>([]),
        selected = $bindable<Set<string>>(new Set<string>()),
        disabled = false,
        disabledIsotopes = new Set<string>()
    } = $props();

    function toggle(isotopeKey: string) {
        if (disabled || disabledIsotopes.has(isotopeKey)) {
            return;
        }
        if (selected.has(isotopeKey)) {
            selected.delete(isotopeKey);
        } else {
            selected.add(isotopeKey);
        }
        // Force reactivity by creating a new Set reference
        selected = new Set(selected);
    }
</script>

<div class="isotope-enable">
    {#if isotopeOptions.length === 0}
        <p>No isotopes available.</p>
    {:else}
        {#each isotopeOptions as option}
            <label class="checkbox label">
                <input type="checkbox"
                    checked={selected.has(option.value)}
                    disabled={disabled || disabledIsotopes.has(option.value)}
                    onchange={() => toggle(option.value)} />
                {option.label}
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
