package com.ayaantrix.collector.ai.provider;

import com.ayaantrix.collector.ai.dto.AiDtos.Result;

import java.time.Duration;
import java.util.*;

/** External inference only; never reads projects or writes answers. */
public interface AiDraftProvider {
    record Input(
            String model,
            String projectType,
            String label,
            String instructions,
            List<String> facts,
            String tone,
            int targetWords,
            int maxOutputTokens) {
        @Override
        public String toString() {
            return "AiProviderInput[redacted]";
        }
    }

    record Output(Result result, long inputTokens, long outputTokens) {
        @Override
        public String toString() {
            return "AiProviderOutput[redacted]";
        }
    }

    final class Failure extends RuntimeException {
        private final String code;
        private final boolean retry;

        public Failure(String code, boolean retry) {
            super(code);
            this.code = code;
            this.retry = retry;
        }

        public String code() {
            return code;
        }

        public boolean retry() {
            return retry;
        }
    }

    boolean available();

    Output generate(Input input, Duration remaining);
}
