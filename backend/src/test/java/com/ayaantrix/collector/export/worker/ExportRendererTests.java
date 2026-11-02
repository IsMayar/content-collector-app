package com.ayaantrix.collector.export.worker;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.export.repository.ExportRepository.Job;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import tools.jackson.databind.json.JsonMapper;

import java.nio.file.*;
import java.time.Instant;
import java.util.*;

class ExportRendererTests {
    @TempDir Path directory;

    @Test
    void markdownEscapesHtmlLinksAndHeadings() throws Exception {
        var json = JsonMapper.builder().build();
        var manifest =
                json.readTree(
                        """
                        {"public":{"projectTitle":"<script>bad</script>","partial":false,"projectVersion":1,"sections":[{"id":"home","title":"# fake heading","items":[{"schema":{"label":"Question"},"revisionId":"revision","value":{"text":"[click](javascript:alert(1)) <img src=x onerror=bad>"},"files":[]}]}]},"sources":[]}
                        """);
        var job =
                new Job(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "APPROVED_MARKDOWN",
                        1,
                        manifest,
                        "RUNNING",
                        null,
                        0,
                        Instant.now(),
                        Instant.now().plusSeconds(86400),
                        UUID.randomUUID(),
                        1,
                        null);
        var target = directory.resolve("content.md");
        new ExportRenderer(null, json).generate(job, target, () -> {});
        var text = Files.readString(target);
        assertThat(text)
                .contains(
                        "&lt;script&gt;",
                        "\\[click\\]\\(javascript:alert\\(1\\)\\)",
                        "\\# fake heading")
                .doesNotContain("<script>", "<img", "[click](javascript:");
    }

    @Test
    void zipRejectsTraversalPathsBeforePrivateRead() throws Exception {
        var json = JsonMapper.builder().build();
        var snapshot =
                json.readTree(
                        """
                        {"public":{"sections":[]},"sources":[{"path":"../../secret","key":"private-key","bytes":1}]}
                        """);
        var job =
                new Job(
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "APPROVED_ZIP",
                        1,
                        snapshot,
                        "RUNNING",
                        null,
                        0,
                        Instant.now(),
                        Instant.now().plusSeconds(86400),
                        UUID.randomUUID(),
                        1,
                        null);
        assertThatThrownBy(
                        () ->
                                new ExportRenderer(null, json)
                                        .generate(job, directory.resolve("bad.zip"), () -> {}))
                .isInstanceOf(java.io.IOException.class)
                .hasMessage("Invalid snapshot path");
    }
}
