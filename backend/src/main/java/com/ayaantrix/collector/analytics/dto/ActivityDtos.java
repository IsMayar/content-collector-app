package com.ayaantrix.collector.analytics.dto;

import java.time.Instant;
import java.util.*;

public final class ActivityDtos {
    private ActivityDtos() {}

    public record SafeAuditEvent(
            UUID id,
            String action,
            String resourceKind,
            UUID resourceId,
            String actorDisplayName,
            Instant occurredAt) {}

    public record Page(int page, int size, long totalElements) {}

    public record Activity(List<SafeAuditEvent> data, Page page) {}
}
