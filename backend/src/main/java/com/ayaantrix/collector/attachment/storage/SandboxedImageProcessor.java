package com.ayaantrix.collector.attachment.storage;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Decodes untrusted raster files only inside a resource-limited, networkless container. */
@Component
public class SandboxedImageProcessor {
    public record Variants(byte[] working, byte[] thumbnail) {}

    private final String image;
    private final String docker;

    public SandboxedImageProcessor(Environment env) {
        image = env.getProperty("IMAGE_WORKER_IMAGE", "");
        docker = env.getProperty("IMAGE_WORKER_DOCKER", "docker");
    }

    public boolean enabled() {
        return !image.isBlank();
    }

    public Variants process(byte[] bytes) {
        if (!enabled()) throw new IllegalStateException("IMAGE_DECODER_UNAVAILABLE");
        Path dir = null;
        Process process = null;
        String container = "collector-image-" + UUID.randomUUID();
        boolean completed = false;
        try {
            dir = Files.createTempDirectory("collector-image-").toRealPath();
            dir.toFile().setWritable(true, false);
            dir.toFile().setReadable(true, false);
            dir.toFile().setExecutable(true, false);
            Files.write(dir.resolve("source"), bytes);
            dir.resolve("source").toFile().setReadable(true, false);
            process =
                    new ProcessBuilder(
                                    List.of(
                                            docker,
                                            "run",
                                            "--rm",
                                            "--name",
                                            container,
                                            "--network",
                                            "none",
                                            "--memory",
                                            "512m",
                                            "--cpus",
                                            "1",
                                            "--pids-limit",
                                            "32",
                                            "--read-only",
                                            "--cap-drop",
                                            "ALL",
                                            "--security-opt",
                                            "no-new-privileges",
                                            "--user",
                                            "65534:65534",
                                            "--tmpfs",
                                            "/tmp:rw,noexec,nosuid,size=64m",
                                            "--mount",
                                            "type=bind,source=" + dir + ",target=/work",
                                            image))
                            .redirectError(ProcessBuilder.Redirect.DISCARD)
                            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                            .start();
            if (!process.waitFor(45, TimeUnit.SECONDS) || process.exitValue() != 0)
                throw new IllegalStateException("IMAGE_PROCESSING_FAILED");
            completed = true;
            Path working = dir.resolve("working.png"), thumb = dir.resolve("thumbnail.png");
            byte[] workingBytes = readOutput(working, 2560),
                    thumbnailBytes = readOutput(thumb, 480);
            if ((long) workingBytes.length + thumbnailBytes.length > 32 * 1048576L)
                throw new IllegalStateException("IMAGE_VARIANT_LIMIT");
            return new Variants(workingBytes, thumbnailBytes);
        } catch (Exception e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("IMAGE_PROCESSING_UNAVAILABLE");
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
            // Killing the CLI alone does not terminate a container on a remote Docker daemon.
            if (!completed && process != null)
                try {
                    var cleanup =
                            new ProcessBuilder(docker, "rm", "-f", container)
                                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                                    .start();
                    if (!cleanup.waitFor(10, TimeUnit.SECONDS)) cleanup.destroyForcibly();
                } catch (Exception e) {
                    if (e instanceof InterruptedException) Thread.currentThread().interrupt();
                }
            if (dir != null)
                try {
                    Path root = Path.of(System.getProperty("java.io.tmpdir")).toRealPath();
                    if (dir.startsWith(root)
                            && !dir.equals(root)
                            && dir.getFileName().toString().startsWith("collector-image-"))
                        try (var paths = Files.walk(dir)) {
                            for (Path path : paths.sorted(Comparator.reverseOrder()).toList())
                                Files.deleteIfExists(path);
                        }
                } catch (Exception ignored) {
                    /* A locked temporary file is safe to retain for host cleanup. */
                }
        }
    }

    // The decoder is isolated precisely because it handles untrusted inputs. Never
    // follow a worker-created link back into the host or read a special device/FIFO.
    static byte[] readOutput(Path file) throws java.io.IOException {
        return readOutput(file, 2560);
    }

    static byte[] readOutput(Path file, int maxEdge) throws java.io.IOException {
        final int limit = 32 * 1048576;
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > limit)
            throw new java.io.IOException("Unsafe image worker output");
        try (var input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
            byte[] bytes = input.readNBytes(limit + 1);
            byte[] signature = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
            if (bytes.length > limit
                    || bytes.length < signature.length
                    || !Arrays.equals(Arrays.copyOf(bytes, signature.length), signature))
                throw new java.io.IOException("Invalid image worker output");
            validatePng(bytes, maxEdge);
            return bytes;
        }
    }

    // Parse bounded container metadata only: pixel decoding stays inside the sandbox.
    static void validatePng(byte[] bytes, int maxEdge) throws java.io.IOException {
        var buffer = java.nio.ByteBuffer.wrap(bytes);
        int offset = 8;
        boolean header = false, data = false;
        Set<String> allowed =
                Set.of(
                        "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "sBIT",
                        "bKGD", "pHYs");
        while (offset <= bytes.length - 12) {
            int length = buffer.getInt(offset);
            if (length < 0 || length > bytes.length - offset - 12) throw invalidPng();
            String type =
                    new String(bytes, offset + 4, 4, java.nio.charset.StandardCharsets.US_ASCII);
            if (!allowed.contains(type))
                throw invalidPng(); // No EXIF, text, animation or unknown metadata.
            var crc = new java.util.zip.CRC32();
            crc.update(bytes, offset + 4, length + 4);
            if ((int) crc.getValue() != buffer.getInt(offset + 8 + length)) throw invalidPng();
            if (!header && !type.equals("IHDR")) throw invalidPng();
            if (type.equals("IHDR")) {
                if (header || length != 13) throw invalidPng();
                int width = buffer.getInt(offset + 8), height = buffer.getInt(offset + 12);
                if (width <= 0 || height <= 0 || width > maxEdge || height > maxEdge)
                    throw invalidPng();
                int depth = bytes[offset + 16] & 255, color = bytes[offset + 17] & 255;
                boolean validDepth =
                        switch (color) {
                            case 0 -> Set.of(1, 2, 4, 8, 16).contains(depth);
                            case 2, 4, 6 -> depth == 8 || depth == 16;
                            case 3 -> Set.of(1, 2, 4, 8).contains(depth);
                            default -> false;
                        };
                if (!validDepth
                        || bytes[offset + 18] != 0
                        || bytes[offset + 19] != 0
                        || (bytes[offset + 20] != 0 && bytes[offset + 20] != 1)) throw invalidPng();
                header = true;
            } else if (type.equals("IDAT")) {
                data |= length > 0;
            } else if (type.equals("IEND")) {
                if (!data || length != 0 || offset + 12 != bytes.length) throw invalidPng();
                return;
            }
            offset += length + 12;
        }
        throw invalidPng();
    }

    private static java.io.IOException invalidPng() {
        return new java.io.IOException("Unsafe image variant structure or metadata");
    }
}
