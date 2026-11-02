package com.ayaantrix.collector.export.worker;

import com.ayaantrix.collector.attachment.storage.PrivateObjectStorage;
import com.ayaantrix.collector.export.repository.ExportRepository.Job;

import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/** File-backed bounded generation; only immutable public snapshot fields reach artifacts. */
@Component
public class ExportRenderer {
    public static final long LIMIT = 2L * 1024 * 1024 * 1024;
    private final PrivateObjectStorage storage;
    private final JsonMapper json;

    public ExportRenderer(PrivateObjectStorage storage, JsonMapper json) {
        this.storage = storage;
        this.json = json;
    }

    public static final class TooLarge extends IOException {
        public TooLarge() {
            super("Export exceeds 2 GB; select fewer sections.");
        }
    }

    public void generate(Job job, Path target, Runnable heartbeat) throws IOException {
        var manifest = job.manifest().path("public");
        try (var raw = Files.newOutputStream(target);
                var bounded = new Bounded(raw)) {
            if (job.format().equals("APPROVED_JSON")) {
                json.writeValue(bounded, manifest);
                return;
            }
            if (job.format().equals("APPROVED_MARKDOWN")) {
                bounded.write(markdown(manifest, null).getBytes(StandardCharsets.UTF_8));
                return;
            }
            try (var zip = new ZipOutputStream(bounded, StandardCharsets.UTF_8)) {
                entry(zip, "manifest.json", json.writeValueAsBytes(manifest));
                for (var section : manifest.path("sections"))
                    entry(
                            zip,
                            "sections/" + section.path("id").asText() + "/content.md",
                            markdown(manifest, section).getBytes(StandardCharsets.UTF_8));
                Set<String> paths = new HashSet<>();
                long total = 0;
                byte[] buffer = new byte[64 * 1024];
                for (var source : job.manifest().path("sources")) {
                    String path = source.path("path").asText();
                    if (!paths.add(path)) continue;
                    if (!path.matches("files/[a-f0-9-]{36}/[a-zA-Z0-9._-]+"))
                        throw new IOException("Invalid snapshot path");
                    heartbeat.run();
                    zip.putNextEntry(new ZipEntry(path));
                    long count = 0;
                    try (var in = storage.openPrivate(source.path("key").asText())) {
                        int n;
                        while ((n = in.read(buffer)) != -1) {
                            total += n;
                            count += n;
                            if (total > LIMIT) throw new TooLarge();
                            heartbeat.run();
                            zip.write(buffer, 0, n);
                        }
                    }
                    if (count != source.path("bytes").asLong())
                        throw new IOException("Snapshot file length changed");
                    zip.closeEntry();
                }
            }
        }
    }

    private static void entry(ZipOutputStream zip, String name, byte[] bytes) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(bytes);
        zip.closeEntry();
    }

    private String markdown(JsonNode manifest, JsonNode selected) {
        var out =
                new StringBuilder("# ")
                        .append(escape(manifest.path("projectTitle").asText()))
                        .append("\n\n")
                        .append(
                                manifest.path("partial").asBoolean()
                                        ? "Partial approved export"
                                        : "Approved export")
                        .append(" · project version ")
                        .append(manifest.path("projectVersion").asLong())
                        .append("\n\n");
        for (var section : manifest.path("sections")) {
            if (selected != null && !section.equals(selected)) continue;
            out.append("## ").append(escape(section.path("title").asText())).append("\n\n");
            for (var item : section.path("items")) {
                out.append("### ")
                        .append(escape(item.path("schema").path("label").asText()))
                        .append("\n\nRevision: ")
                        .append(item.path("revisionId").asText())
                        .append("\n\n");
                renderValue(out, item.path("value"), 0);
                out.append("\n");
                for (var file : item.path("files"))
                    out.append("File: ")
                            .append(escape(file.path("name").asText()))
                            .append(" ( ")
                            .append(escape(file.path("path").asText()))
                            .append(" )\n\n");
            }
        }
        return out.toString();
    }

    private void renderValue(StringBuilder out, JsonNode value, int depth) {
        if (value.isObject()) {
            var it = value.properties().iterator();
            while (it.hasNext()) {
                var e = it.next();
                out.append(escape(e.getKey())).append(": ");
                renderValue(out, e.getValue(), depth + 1);
            }
        } else if (value.isArray()) {
            for (var v : value) {
                out.append("• ");
                renderValue(out, v, depth + 1);
            }
        } else out.append(escape(value.isNull() ? "" : value.asText())).append("\n\n");
    }

    static String escape(String s) {
        var out = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '&') out.append("&amp;");
            else if (c == '<') out.append("&lt;");
            else if (c == '>') out.append("&gt;");
            else if ("\\`*_{}[]()#+-.!|".indexOf(c) >= 0) out.append('\\').append(c);
            else if (c == '\n' || c == '\t' || !Character.isISOControl(c)) out.append(c);
        }
        return out.toString();
    }

    private static final class Bounded extends FilterOutputStream {
        long count;

        Bounded(OutputStream out) {
            super(out);
        }

        public void write(int b) throws IOException {
            if (++count > LIMIT) throw new TooLarge();
            out.write(b);
        }

        public void write(byte[] b, int off, int len) throws IOException {
            if ((count += len) > LIMIT) throw new TooLarge();
            out.write(b, off, len);
        }
    }
}
