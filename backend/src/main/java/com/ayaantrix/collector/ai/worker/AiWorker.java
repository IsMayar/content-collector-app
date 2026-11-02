package com.ayaantrix.collector.ai.worker;

import com.ayaantrix.collector.ai.provider.*;
import com.ayaantrix.collector.ai.repository.AiRepository;
import com.ayaantrix.collector.ai.security.AiAuthorization;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.json.JsonMapper;

import java.time.*;

@Component
public class AiWorker {
    private final AiRepository jobs;
    private final AiDraftProvider provider;
    private final AiAuthorization policy;
    private final ClientAccessAuthorization auth;
    private final JsonMapper json;
    private final Clock clock;
    private final TransactionTemplate tx;

    public AiWorker(
            AiRepository jobs,
            AiDraftProvider provider,
            AiAuthorization policy,
            ClientAccessAuthorization auth,
            JsonMapper json,
            Clock clock,
            PlatformTransactionManager manager) {
        this.jobs = jobs;
        this.provider = provider;
        this.policy = policy;
        this.auth = auth;
        this.json = json;
        this.clock = clock;
        this.tx = new TransactionTemplate(manager);
    }

    private boolean eligible(AiRepository.Job j) {
        try {
            var a = auth.available(j.workspace(), j.project(), j.contact(), false);
            if (a.isEmpty()) return false;
            policy.field(a.get(), j.item(), true);
            return true;
        } catch (com.ayaantrix.collector.common.error.ApiException denied) {
            return false;
        }
    }

    public boolean dispatchOne() {
        var optional = tx.execute(s -> jobs.claim(clock.instant()));
        if (optional == null || optional.isEmpty()) return false;
        var j = optional.get();
        if (!Boolean.TRUE.equals(tx.execute(s -> eligible(j))) || !provider.available()) {
            tx.executeWithoutResult(
                    s ->
                            jobs.finish(
                                    j,
                                    "FAILED",
                                    null,
                                    "AI_UNAVAILABLE",
                                    0,
                                    0,
                                    0,
                                    false,
                                    clock.instant()));
            return true;
        }
        var input = json.treeToValue(j.input(), AiDraftProvider.Input.class);
        AiDraftProvider.Output output = null;
        String failure = null;
        int calls = 0;
        long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (calls < 2) {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) {
                failure = "AI_TIMEOUT";
                break;
            }
            calls++;
            try {
                output = provider.generate(input, Duration.ofNanos(remaining));
                OpenAiResponsesProvider.validate(output.result(), input);
                if (output.inputTokens() < 0
                        || output.inputTokens() > j.inputBound()
                        || output.outputTokens() < 0
                        || output.outputTokens() > j.outputBound())
                    throw new AiDraftProvider.Failure("AI_INVALID_OUTPUT", false);
                break;
            } catch (AiDraftProvider.Failure e) {
                failure = e.code();
                output = null;
                if (!e.retry()) break;
            } catch (RuntimeException e) {
                failure = "AI_PROVIDER_ERROR";
                output = null;
                break;
            }
        }
        // Conservatively retain worst-case cost after failures/unknown outcomes, including a retry.
        long cost =
                output == null || calls > 1
                        ? j.reserved()
                        : Math.addExact(
                                Math.multiplyExact(output.inputTokens(), j.inputRate()),
                                Math.multiplyExact(output.outputTokens(), j.outputRate()));
        var result = output;
        var code = failure;
        long latency =
                Math.max(
                        0,
                        (System.nanoTime() - deadline + Duration.ofSeconds(30).toNanos())
                                / 1000000);
        tx.executeWithoutResult(
                s -> {
                    boolean allowed = eligible(j);
                    String state =
                            result != null && allowed
                                    ? "SUCCEEDED"
                                    : "AI_REFUSED".equals(code) ? "REFUSED" : "FAILED";
                    jobs.finish(
                            j,
                            state,
                            result != null && allowed ? json.valueToTree(result.result()) : null,
                            allowed ? (result != null ? null : code) : "AI_ACCESS_CHANGED",
                            cost,
                            result == null ? 0 : result.inputTokens(),
                            result == null ? 0 : result.outputTokens(),
                            true,
                            clock.instant());
                    jobs.latency(j, latency);
                });
        return true;
    }

    public void cleanup() {
        tx.executeWithoutResult(s -> jobs.maintenance(clock.instant()));
    }
}
