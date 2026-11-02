package com.ayaantrix.collector.export.dto;

import jakarta.validation.constraints.*;

import java.util.*;

public final class ExportDtos {
    private ExportDtos() {}

    public enum Format {
        APPROVED_ZIP,
        APPROVED_JSON,
        APPROVED_MARKDOWN
    }

    public record Create(
            @NotNull Format format,
            @NotNull @Min(1) Long expectedProjectVersion,
            boolean includeOriginals,
            boolean acknowledgePartial,
            @Size(min = 1, max = 100) List<UUID> sectionIds) {}
}
