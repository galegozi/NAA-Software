<script lang="ts">
	/**
	 * Progress indicator showing current position in the workflow
	 */
	interface Props {
		currentStep: number;
		totalSteps: number;
		percentage: number;
	}

	let { currentStep, totalSteps, percentage }: Props = $props();
</script>

<div class="progress-container">
	<div class="progress-bar">
		<div class="progress-fill" style="width: {percentage}%"></div>
	</div>
	<div class="progress-text">
		Step {currentStep} of {totalSteps} ({percentage}%)
	</div>
</div>

<style>
	.progress-container {
		margin: 1rem 0;
		width: 100%;
	}

	.progress-bar {
		width: 100%;
		height: 8px;
		background-color: #e5e7eb;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
		transition: width 0.3s ease;
	}

	.progress-text {
		margin-top: 0.5rem;
		font-size: 0.875rem;
		color: #6b7280;
		text-align: center;
	}
</style>
