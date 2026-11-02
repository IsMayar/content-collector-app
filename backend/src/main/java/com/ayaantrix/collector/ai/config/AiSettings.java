package com.ayaantrix.collector.ai.config;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class AiSettings {
    public final String model, key;
    public final boolean enabled;
    public final long inputRate, outputRate, budget;
    public final int outputTokens, trial;

    public AiSettings(Environment env) {
        enabled = env.getProperty("AI_ENABLED", Boolean.class, false);
        model = env.getProperty("AI_MODEL", "");
        key = env.getProperty("OPENAI_API_KEY", "");
        inputRate = env.getProperty("AI_INPUT_MICROUSD_PER_TOKEN", Long.class, 0L);
        outputRate = env.getProperty("AI_OUTPUT_MICROUSD_PER_TOKEN", Long.class, 0L);
        budget = env.getProperty("AI_MONTHLY_BUDGET_MICROUSD", Long.class, 0L);
        outputTokens = env.getProperty("AI_MAX_OUTPUT_TOKENS", Integer.class, 2048);
        trial = env.getProperty("collector.workspace.trial-ai-drafts", Integer.class, 0);
        if (outputTokens < 256
                || outputTokens > 4096
                || inputRate < 0
                || outputRate < 0
                || budget < 0
                || inputRate > 1000000
                || outputRate > 1000000)
            throw new IllegalStateException("Invalid AI cost/output configuration");
        if (enabled
                && (model.isBlank()
                        || key.isBlank()
                        || inputRate == 0
                        || outputRate == 0
                        || budget == 0))
            throw new IllegalStateException(
                    "Enabled AI requires explicit model, credential and verified upper-bound"
                            + " prices/budget");
    }

    @Override
    public String toString() {
        return "AiSettings[redacted]";
    }
}
