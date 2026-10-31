package com.ayaantrix.collector.attachment.storage;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.*;
import java.util.Base64;

class SandboxedImageProcessorTests {
    @TempDir Path directory;

    @Test
    void readsAnActualBoundedPngOutput() throws Exception {
        byte[] png =
                Base64.getDecoder()
                        .decode(
                                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lGkAAAAASUVORK5CYII=");
        Path output = directory.resolve("working.png");
        Files.write(output, png);
        assertThat(SandboxedImageProcessor.readOutput(output)).isEqualTo(png);
    }

    @Test
    void rejectsDirectoriesAndNonImageWorkerResults() throws Exception {
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(directory))
                .isInstanceOf(java.io.IOException.class);
        Path output = directory.resolve("working.png");
        Files.writeString(output, "not a decoded PNG");
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(output))
                .isInstanceOf(java.io.IOException.class);
    }

    @Test
    void oversizedWorkerOutputIsNotLoadedIntoMemory() throws Exception {
        Path output = directory.resolve("working.png");
        try (var channel =
                java.nio.channels.FileChannel.open(
                        output, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            channel.position(32 * 1048576L);
            channel.write(java.nio.ByteBuffer.wrap(new byte[] {0}));
        }
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(output))
                .isInstanceOf(java.io.IOException.class);
    }
}
